# Syar — Cloudflare Worker

Backend API for the Syar assistant in StudyHub. This project is kept separate from the static StudyHub website.

## Files

- `src/index.js` — chat endpoint, Supabase session and approval checks, and daily quota.
- `wrangler.toml` — Worker, Workers AI, and SQLite Durable Object configuration.

## Current safeguards

- Only accepts requests from the configured StudyHub Pages origin.
- Requires a valid Supabase access token.
- Checks that the matching `studyhub_students` registration has `approved = true`.
- Limits each approved student to 20 chat requests per UTC day.
- Validates request size, message count, role, and message length.
- Does not persist chat messages or transcripts.
- Does not expose provider credentials in frontend code.

## Before connecting/deploying

1. In Cloudflare, import this GitHub repository and set the root directory to `workers/syar`.
2. Have the account guardian configure `SUPABASE_API_KEY` as a Worker secret. Use the existing Supabase publishable/anon key; never put a service-role key here.
3. Confirm the Workers AI binding and the `DailyQuota` SQLite Durable Object migration from `wrangler.toml`.
4. Deploy only after reviewing the Cloudflare build settings and secret configuration.

The `/chat` endpoint is for approved, signed-in students only at this stage. Guest access and voice features are not implemented yet. Do not deploy a public endpoint before the guardian has configured and reviewed the account.

## Local configuration

The non-secret project URL, allowed StudyHub origin, and model ID are in `wrangler.toml`. Do not add passwords, access tokens, service-role keys, or other credentials to Git.
