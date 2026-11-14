# Syar — Cloudflare Worker

This directory is reserved for the StudyHub Syar AI backend.

## Planned structure

- `wrangler.toml` — Cloudflare Worker configuration and AI binding.
- `src/index.js` — Worker request handler.
- Secrets and provider credentials must be configured in the Cloudflare dashboard; never commit them here.

## Safety and deployment checklist

Before deployment, implement and test:
- StudyHub-origin CORS handling.
- Request validation and payload size limits.
- Server-side guest/student quotas and rate limiting.
- Appropriate session validation without exposing student personal data.
- No chat transcript storage by default.

Do not deploy this placeholder directory. The existing StudyHub website is kept separate from this Worker.
