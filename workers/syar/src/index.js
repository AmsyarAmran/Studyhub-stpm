const MAX_BODY_BYTES = 16_000;
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 3_000;
const DAILY_LIMIT = 500;

const SYAR_SYSTEM_PROMPT = [
  "Nama kamu Syar, teman AI dalam StudyHub.",
  "Bercakap dalam Bahasa Melayu Malaysia yang santai, jelas dan semula jadi. Ikut bahasa pengguna jika mereka menggunakan bahasa lain.",
  "Jadilah teman berbual yang mesra dan membantu, bukan tutor yang terlalu formal. Dengar dahulu, jawab tepat, dan tanya soalan susulan hanya apabila sesuai.",
  "Jangan mendakwa kamu manusia atau mempunyai pengalaman dan perasaan manusia. Hormati privasi dan jangan minta kata laluan, token, atau maklumat peribadi sensitif.",
  "Jawab dengan sangat ringkas dan terus kepada soalan: biasanya 1 hingga 3 ayat sahaja. Elakkan penerangan panjang, mukadimah, pengulangan dan senarai yang tidak perlu. Beri huraian lebih panjang hanya apabila pengguna memintanya atau tugasan memang memerlukannya. Untuk soalan mudah, jawab dalam satu atau dua ayat. Jika tidak pasti, nyatakan dengan jujur."
].join(" ");

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

function corsHeaders(origin, allowedOrigin) {
  if (!origin || origin !== allowedOrigin) return {};
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.CORS_ORIGIN;
    const cors = corsHeaders(origin, allowedOrigin);

    if (origin && origin !== allowedOrigin) return json({ error: "Origin tidak dibenarkan." }, 403);
    if (request.method === "OPTIONS") {
      if (!origin || origin !== allowedOrigin) return json({ error: "Origin tidak dibenarkan." }, 403);
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "syar-worker" }, 200, cors);
    }
    if (url.pathname !== "/chat") return json({ error: "Laluan tidak ditemui." }, 404, cors);
    if (request.method !== "POST") return json({ error: "Kaedah tidak dibenarkan." }, 405, cors);
    if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "Origin tidak dibenarkan." }, 403, cors);
    if (!env.SUPABASE_URL || !env.SUPABASE_API_KEY || !env.AI) {
      return json({ error: "Backend belum dikonfigurasi sepenuhnya." }, 503, cors);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "Permintaan terlalu besar." }, 413, cors);

    const authorization = request.headers.get("Authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return json({ error: "Sila log masuk ke StudyHub." }, 401, cors);

    let user;
    try {
      const authResponse = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
        headers: { "apikey": env.SUPABASE_API_KEY, "Authorization": "Bearer " + tokenMatch[1] },
        signal: AbortSignal.timeout(8000)
      });
      const authData = await authResponse.json().catch(() => ({}));
      if (!authResponse.ok) {
        const reason = String(authData.msg || authData.message || authData.error_description || authData.error || "Tiada butiran").slice(0, 180);
        return json({ error: "Supabase menolak sesi (HTTP " + authResponse.status + "): " + reason }, 401, cors);
      }
      user = authData;
      if (!user || !user.id) return json({ error: "Sesi tidak sah." }, 401, cors);
    } catch {
      return json({ error: "Tidak dapat mengesahkan sesi. Cuba lagi sebentar." }, 503, cors);
    }

    try {
      const approvalUrl = env.SUPABASE_URL.replace(/\/$/, "") +
        "/rest/v1/studyhub_students?select=approved&user_id=eq." + encodeURIComponent(user.id) + "&limit=1";
      const approvalResponse = await fetch(approvalUrl, {
        headers: { "apikey": env.SUPABASE_API_KEY, "Authorization": "Bearer " + tokenMatch[1] },
        signal: AbortSignal.timeout(8000)
      });
      if (!approvalResponse.ok) return json({ error: "Status pendaftaran tidak dapat disemak." }, 503, cors);
      const registrations = await approvalResponse.json();
      if (!Array.isArray(registrations) || registrations.length === 0 || registrations[0].approved !== true) {
        return json({ error: "Akses Syar hanya tersedia selepas pendaftaran StudyHub diluluskan." }, 403, cors);
      }
    } catch {
      return json({ error: "Tidak dapat menyemak kelulusan akaun. Cuba lagi." }, 503, cors);
    }

    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "Permintaan terlalu besar." }, 413, cors);
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "Format permintaan tidak sah." }, 400, cors);
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > MAX_MESSAGES) {
      return json({ error: "Mesej perbualan tidak sah." }, 400, cors);
    }
    const messages = [];
    for (const item of payload.messages) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        return json({ error: "Format mesej tidak sah." }, 400, cors);
      }
      const content = item.content.trim();
      if (!content || content.length > MAX_MESSAGE_CHARS) return json({ error: "Panjang mesej tidak dibenarkan." }, 400, cors);
      messages.push({ role: item.role, content });
    }
    if (messages[messages.length - 1].role !== "user") {
      return json({ error: "Mesej terakhir mestilah daripada pengguna." }, 400, cors);
    }

    try {
      const result = await env.AI.run(env.AI_MODEL || "@cf/zai-org/glm-4.7-flash", {
        messages: [{ role: "system", content: SYAR_SYSTEM_PROMPT }, ...messages],
        max_tokens: 384,
        temperature: 0.65,
        chat_template_kwargs: { enable_thinking: false }
      });
      const reply = typeof result?.choices?.[0]?.message?.content === "string"
        ? result.choices[0].message.content.trim()
        : typeof result?.response === "string"
          ? result.response.trim()
          : "";
      if (!reply) return json({ error: "Syar belum dapat menjawab. Cuba lagi sebentar." }, 502, cors);
      return json({ reply }, 200, cors);
    } catch {
      return json({ error: "Perkhidmatan Syar mengalami gangguan. Cuba lagi sebentar." }, 502, cors);
    }
  }
};

export class DailyQuota {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS daily_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL)");
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    const day = new Date().toISOString().slice(0, 10);
    const inserted = this.sql.exec(
      "INSERT INTO daily_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count",
      day,
      DAILY_LIMIT
    ).toArray()[0];

    if (!inserted) {
      return json({ allowed: false, remaining: 0 });
    }
    return json({ allowed: true, remaining: Math.max(0, DAILY_LIMIT - inserted.count) });
  }
}
