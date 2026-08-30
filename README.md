# Loan Pre-Qualification Tool (Phase 1)

Live loan pre-qualification and soft-offer tool for iso-shop sales reps. See
`loan-qualifier-tool-spec.md` for the full product spec this was built from.

Stack: Next.js (App Router) + Supabase (Postgres + Auth) + Tailwind + Resend.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then run
   `supabase/migrations/0001_init.sql` against it (SQL Editor, or `supabase db push`
   if you're using the CLI).

3. **Copy env vars**
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project's Settings > API page.
   - `SHOP_SESSION_SECRET` — random string, e.g. `openssl rand -hex 32`.
   - `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — from [resend.com](https://resend.com).
   - `VP_EMAIL` / `VP_NAME` — who Section 9 notification emails go to.

4. **Create your first Admin account.** Sign a user up via Supabase Auth (dashboard,
   or your own script), then promote them to Admin — app_metadata can only be set
   with the service-role key, so this has to happen server-side/via SQL, never from
   the app itself:
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = 'someone@yourcompany.com';
   ```
   Log in at `/admin/login`. From there you can create shop codes for reps.

5. **Run it**
   ```bash
   npm run dev
   ```
   - `/` — shop-code login for reps
   - `/deal` — the live pre-qualification form (requires a shop code)
   - `/admin/login` — Admin sign-in
   - `/admin` — shop management (create/deactivate shop codes)

## Testing

- `npm run test:scenarios` — runs the rules engine and soft-offer calculator against
  the scenarios called out in the spec (clean deal, each disqualification type, the
  Alaska case, the $1.5M+ case, a 2nd-position deal). Pure logic, no DB needed.
- `npm run build` / `npm run lint` — type-check and lint.
- End-to-end (shop login → form → email) needs a real Supabase project and Resend
  key configured as above; there's no mock backend for this in Phase 1.

## Assumptions flagged for the VP (per spec Section 10 — do not silently trust these)

The spec explicitly calls out two of these; three more turned up while implementing
Section 7's math, where the source table didn't give clean answers. All are isolated
in `src/lib/soft-offer.ts` (see the comment block at the top of that file) so they're
easy to find and change once confirmed:

1. **Commercial factor rate low end** — assumed 1.45; source material only specifies "up to 1.63."
2. **2nd-position cushion (73%–80% of equity)** — from one worked example, not a stated general rule.
3. **LTV band low/high when the spec's table gives a single number instead of a range** (e.g. commercial standard-state "65% typical / 70% max") — we treat that as the quoted [low, high] band. Where the table already gives a range (residential standard-state 70%–75%), we use it as-is and treat "max clean file" (80%) as an unused ceiling, not part of the quote.
4. **Land and industrial property types have no LTV band or factor rate defined anywhere in Section 7** (only Residential and Commercial rows exist). They default to the Commercial numbers as the closer analog.
5. **Which single point in the LTV band feeds the 2nd-position equity formula** — the formula needs one percentage, the table gives a range; we use the band's low end (the conservative default).

Also flagged, not yet resolved by design (per spec Section 10, items 3–4):
- Whether onboarding-only Admins should eventually see submission data — not built, Admin is scoped to shop management only.
- The VP dashboard (Phase 2) is entirely unscoped and intentionally not started.

## Notable implementation choices not spelled out in the spec

- **Rep contact fields (name/phone/email) are positioned first**, ahead of the
  fast-disqualification fields (state/type/value). The DB requires them NOT NULL,
  and disqualification can otherwise trigger before a rep would reach them.
- **Property subtype capture** (Section 6.1) is implemented as a checklist plus a
  `property_subtypes` array column and `assisted_living_converted_sfr` boolean —
  these aren't in the spec's literal Section 4 table but are necessary to catch the
  named excluded sub-types.
- **Disqualified attempts save themselves automatically** the moment the live rules
  engine disqualifies a deal (client effect → `recordDisqualifiedAttempt`), since the
  form intentionally has no submit button to reach on a blocked deal, but Section 4
  asks that every attempt be stored.
- **The "Send to VP" server action re-runs the disqualification rules and soft-offer
  math from scratch server-side** rather than trusting whatever the client displayed,
  before saving/emailing — defense against a tampered client.

## Deploying

Push to a Git remote, import into Vercel, set the same env vars from `.env.local`
in the Vercel project settings, and connect your domain.
