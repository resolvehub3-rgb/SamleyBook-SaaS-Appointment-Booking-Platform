# Deploying SamleyBook to Vercel (Hobby plan, dashboard/Git)

This project is already configured for Vercel via `vercel.json`. No CLI is required.

## 1. Push the repo to GitHub

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

## 2. Import the project in Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository.
3. Vercel auto-detects the Vite framework. Keep the defaults:
   - Build command: `pnpm build`
   - Output directory: `dist`
   - Install command: `pnpm install`
4. Click **Deploy** (first deploy will fail until env vars are added — that's expected).

## 3. Add environment variables

In Vercel: Project → Settings → Environment Variables. Add every variable from `.env.example`
for **Production** (and Preview if you want). At minimum:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL` (your Vercel URL, e.g. `https://samleybook.vercel.app`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SASUSYNC_API_KEY`
- `SASUSYNC_SENDER_ID`
- `SASUSYNC_BASE_URL`
- `SASUSYNC_WEBHOOK_SECRET`
- `CRON_SECRET` (recommended)

After adding them, redeploy (Deployments → Redeploy).

## 4. Set up the Supabase database

Run the SQL files in your Supabase SQL Editor (in order):

- `src/lib/supabase-schema.sql`
- `src/lib/sms-schema.sql`
- `src/lib/sms-management-schema.sql`
- files under `supabase/migrations/`

## 5. Configure SasuSync webhook

Point your SasuSync webhook to:

```
https://your-app.vercel.app/api/webhooks/sasu-sync
```

with the `X-Webhook-Signature` header signed using `SASUSYNC_WEBHOOK_SECRET`.

## Hobby-plan notes

- Cron jobs on the Hobby plan can run **at most once per day**. The reminder cron is
  scheduled for `0 0 * * *` (daily). If you need hourly reminders, upgrade to Pro and
  change the schedule in `vercel.json`.
- Serverless functions on Hobby have a **10 second** max duration. The reminder cron
  processes up to 10 reminders per run to stay within this limit.
- Redeploy after any change to `vercel.json`.

## Troubleshooting

- `/api/*` returns the SPA HTML: ensure `vercel.json` rewrites exclude `api/`
  (already configured).
- Webhook signature failures: confirm `bodyParser` is disabled for the webhook
  (already configured) and the raw body is used.
- Missing env vars surface as `Missing SUPABASE_URL...` errors in function logs.

## 6. Marketing Website vs Business App PWA Architecture

- **Public Marketing Website**: Served at `/`, `/features`, `/pricing`, `/about`, `/faq`, `/contact` with dedicated marketing header/footer (`MarketingLayout`).
- **Public Customer Booking & Feedback**: Served at `/b/:slug` and `/feedback/:token` without requiring customer login.
- **Standalone Business Application & Installed PWA**: Served strictly under `/app/*` (`/app/login`, `/app/register`, `/app/dashboard`, `/app/appointments`, `/app/services`, `/app/customers`, `/app/payments`, `/app/payment-config`, `/app/booking-page`, `/app/subscription`, `/app/business-profile`, `/app/settings`, `/app/admin`).
- **PWA Manifest**: Uses `start_url: "/app/login"`, `scope: "/app/"`, `id: "/app/"`, `display: "standalone"`. Installed PWAs launch into `/app/login`, silently restore valid Supabase sessions straight into `/app/dashboard` (or `/app/admin`), and always return to `/app/login` on Sign Out or session expiration.
- **Future Custom Subdomain Option**: If moving to a custom domain later (e.g., `samleybook.com` for marketing and `app.samleybook.com` for the business application), update Supabase Authentication **Site URL** and **Redirect URLs** to include both origins, and note that Supabase `localStorage` session tokens are origin-scoped (moving from `*.vercel.app` to `app.samleybook.com` requires one-time sign-in on the new origin).