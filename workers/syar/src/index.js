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
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-StudyHub-Guest",
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
    if (url.pathname === "/notify-registration") {
      if (request.method !== "POST") return json({ error: "Kaedah tidak dibenarkan." }, 405, cors);
      if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "Origin tidak dibenarkan." }, 403, cors);
      if (!env.SUPABASE_URL || !env.SUPABASE_API_KEY || !env.DAILY_QUOTA || !env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
        return json({ error: "Tetapan notifikasi belum lengkap." }, 503, cors);
      }
      const authorization = request.headers.get("Authorization") || "";
      const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch) return json({ error: "Sesi log masuk diperlukan." }, 401, cors);
      let user;
      try {
        const authResponse = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
          headers: { "apikey": env.SUPABASE_API_KEY, "Authorization": "Bearer " + tokenMatch[1] },
          signal: AbortSignal.timeout(8000)
        });
        const authData = await authResponse.json().catch(() => ({}));
        if (!authResponse.ok || !authData.id) return json({ error: "Sesi tidak sah." }, 401, cors);
        user = authData;
      } catch {
        return json({ error: "Tidak dapat mengesahkan sesi." }, 503, cors);
      }

      try {
        const pendingUrl = env.SUPABASE_URL.replace(/\/$/, "") +
          "/rest/v1/studyhub_students?select=approved&user_id=eq." + encodeURIComponent(user.id) + "&limit=1";
        const pendingResponse = await fetch(pendingUrl, {
          headers: { "apikey": env.SUPABASE_API_KEY, "Authorization": "Bearer " + tokenMatch[1] },
          signal: AbortSignal.timeout(8000)
        });
        if (!pendingResponse.ok) return json({ error: "Status permohonan tidak dapat disemak." }, 503, cors);
        const rows = await pendingResponse.json();
        if (!Array.isArray(rows) || !rows.length || rows[0].approved !== false) {
          return json({ error: "Tiada permohonan baharu yang menunggu kelulusan." }, 403, cors);
        }
      } catch {
        return json({ error: "Tidak dapat menyemak permohonan." }, 503, cors);
      }

      const quotaId = env.DAILY_QUOTA.idFromName("studyhub-registration-push");
      const quotaStub = env.DAILY_QUOTA.get(quotaId);
      let claimed = false;
      try {
        const claimResponse = await quotaStub.fetch("https://quota.local/claim-registration-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id })
        });
        const claim = await claimResponse.json();
        if (!claim.claimed) return json({ ok: true, alreadyNotified: true }, 200, cors);
        claimed = true;
      } catch {
        return json({ error: "Status penghantaran notifikasi tidak dapat disahkan." }, 503, cors);
      }

      try {
        const pushResponse = await fetch("https://api.onesignal.com/notifications?c=push", {
          method: "POST",
          headers: {
            "Authorization": "Key " + env.ONESIGNAL_REST_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            app_id: env.ONESIGNAL_APP_ID,
            target_channel: "push",
            include_aliases: { external_id: ["studyhub-admin"] },
            headings: { en: "StudyHub: Permohonan baharu", ms: "StudyHub: Permohonan baharu" },
            contents: { en: "A new account is waiting for approval.", ms: "Ada permohonan akaun baharu yang menunggu kelulusan." },
            url: "https://amsyaramran.github.io/Studyhub-stpm/"
          }),
          signal: AbortSignal.timeout(10000)
        });
        const pushResult = await pushResponse.json().catch(() => ({}));
        if (!pushResponse.ok) {
          await quotaStub.fetch("https://quota.local/release-registration-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: user.id })
          });
          return json({ error: "OneSignal gagal menghantar notifikasi.", detail: String(pushResult.errors || pushResult.message || "Ralat tidak diketahui").slice(0, 180) }, 502, cors);
        }
        return json({ ok: true }, 200, cors);
      } catch {
        if (claimed) {
          await quotaStub.fetch("https://quota.local/release-registration-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: user.id })
          }).catch(() => {});
        }
        return json({ error: "Sambungan OneSignal gagal." }, 502, cors);
      }
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
    const guestId = request.headers.get("X-StudyHub-Guest") || "";
    let user = null;

    if (tokenMatch) {
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
    } else if (!/^[A-Za-z0-9_-]{20,80}$/.test(guestId)) {
      return json({ error: "Sila log masuk atau mulakan sesi tetamu untuk menggunakan Syar." }, 401, cors);
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

    let guestRemaining = null;
    if (!user) {
      if (!env.DAILY_QUOTA) return json({ error: "Had mesej tetamu belum dikonfigurasi." }, 503, cors);
      try {
        const quotaId = env.DAILY_QUOTA.idFromName("syar-guest-" + guestId);
        const quotaStub = env.DAILY_QUOTA.get(quotaId);
        const quotaResponse = await quotaStub.fetch("https://quota.local/guest", { method: "POST" });
        const quota = await quotaResponse.json();
        if (!quota.allowed) {
          return json({ error: "Anda telah menggunakan 10 mesej percuma. Log masuk ke StudyHub untuk terus berbual dengan Syar.", remaining: 0 }, 429, cors);
        }
        guestRemaining = quota.remaining;
      } catch {
        return json({ error: "Had mesej tetamu tidak dapat disemak. Cuba lagi sebentar." }, 503, cors);
      }
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
      return json(user ? { reply } : { reply, remaining: guestRemaining }, 200, cors);
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
    this.sql.exec("CREATE TABLE IF NOT EXISTS guest_usage (id TEXT PRIMARY KEY, count INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS registration_notifications (user_id TEXT PRIMARY KEY)");
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/claim-registration-notification" && request.method === "POST") {
      try {
        const body = await request.json();
        const userId = String(body.user_id || "");
        if (!/^[0-9a-f-]{30,40}$/i.test(userId)) return json({ claimed: false }, 400);
        const row = this.sql.exec(
          "INSERT OR IGNORE INTO registration_notifications (user_id) VALUES (?) RETURNING user_id",
          userId
        ).toArray()[0];
        return json({ claimed: !!row });
      } catch {
        return json({ claimed: false }, 400);
      }
    }
    if (url.pathname === "/release-registration-notification" && request.method === "POST") {
      try {
        const body = await request.json();
        const userId = String(body.user_id || "");
        this.sql.exec("DELETE FROM registration_notifications WHERE user_id = ?", userId);
        return json({ released: true });
      } catch {
        return json({ released: false }, 400);
      }
    }
    if (url.pathname === "/guest" && request.method === "POST") {
      const row = this.sql.exec(
        "INSERT INTO guest_usage (id, count) VALUES ('total', 1) ON CONFLICT(id) DO UPDATE SET count = count + 1 WHERE count < 10 RETURNING count"
      ).toArray()[0];
      if (!row) return json({ allowed: false, remaining: 0 });
      return json({ allowed: true, remaining: Math.max(0, 10 - row.count) });
    }
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    const day = new Date().toISOString().slice(0, 10);
    const inserted = this.sql.exec(
      "INSERT INTO daily_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count",
      day,
      DAILY_LIMIT
    ).toArray()[0];
    if (!inserted) return json({ allowed: false, remaining: 0 });
    return json({ allowed: true, remaining: Math.max(0, DAILY_LIMIT - inserted.count) });
  }
}
