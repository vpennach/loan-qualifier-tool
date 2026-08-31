# Loan Pre-Qualification Tool (Phase 1)

Live loan pre-qualification and soft-offer tool for iso-shop sales reps. See
`loan-qualifier-tool-spec.md` for the original product spec this was built
from, and `Updated Product structure .docx` (WBL internal closer training)
for the underlying source material that spec was itself summarizing — the
latter has since corrected a couple of things the spec got wrong (see
Assumptions below).

Stack: Next.js (App Router) + Supabase (Postgres + Auth) + Tailwind + Resend.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then run
   every file under `supabase/migrations/` against it, in order (SQL Editor, or
   `supabase db push` if you're using the CLI). There's no migration tooling wired
   up — each file has to be applied by hand.

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

## Assumptions flagged for the VP (do not silently trust these)

**RESOLVED by "Updated Product structure .docx"** — the WBL closer training doc's
worked examples confirmed or corrected the original spec's Section 10 assumptions:

- **Minimum loan size, not minimum property value.** The original spec's $100k/$250k
  floor checked `current_value` directly ("Property value is below our $100,000
  minimum"). That was wrong — the training doc is explicit these are minimum LOAN
  sizes: $100,000 residential, $250,000 commercial, $250,000 for NY residential
  specifically. A cheap property can still qualify if the LTV math clears the floor;
  an expensive one can still fail it in 2nd position once debt is netted out. Fixed
  in `rules-engine.ts` (`computeOfferRange` + `minimumLoanThreshold` in
  `soft-offer.ts`) — the check now runs the actual loan-range math live, as soon as
  state/type/value/position(/debt) are all present, instead of checking the raw
  value the instant it's typed.
- **Residential factor rate (1.33–1.44)** — confirmed exactly by Example A (1.35, in-range).
- **Residential LTV (70%–75% typical, 80% ceiling)** — confirmed by Example A (72% LTV, within the typical band).
- **2nd-position cushion (73%–80% of equity)** — confirmed by the dedicated Equity Formula worked example: $375,000 equity → $275,000–$300,000 offer is exactly 73.3%–80%.

**STILL UNRESOLVED** — flag to the VP before trusting these for a real quote. All
isolated in `src/lib/soft-offer.ts`'s header comment so they're easy to find:

1. **Commercial factor rate low end** — still assumed 1.45; the training doc still only says "up to 1.63." Example D uses 1.58 for one file, which doesn't resolve the low end either.
2. **Commercial LTV band** — the training doc gives no "typical" for commercial, only "up to 70%" (max). We currently quote 65%–70% (the 65% is inherited from the original spec and isn't actually supported anywhere in the training doc — Example D just uses a flat 70%). Worth confirming whether commercial should be a single ~70% point instead of a range.
3. **Land and industrial property types** have no LTV band, factor rate, or minimum loan size defined in either document. They default to the Commercial numbers as the closer analog.
4. **Which single point in the LTV band feeds the 2nd-position equity formula** — the dedicated worked example uses 75% (the band's HIGH end), but a different example in the same doc (Example B) implies something closer to no cushion at all applied. These two examples don't agree with each other. We still use the band's LOW end (conservative default) pending clarification.

Also flagged, not yet resolved by design (per spec Section 10, items 3–4):
- Whether onboarding-only Admins should eventually see submission data — not built, Admin is scoped to shop management only.
- The VP dashboard (Phase 2) is entirely unscoped and intentionally not started.

## Notable implementation choices not spelled out in the spec

- **Form order**: Rep Info → Borrower → Property → Deal Details (per rep UX feedback,
  not the spec's original layout). Rep contact fields stay first since the DB
  requires them NOT NULL and disqualification can otherwise trigger before a rep
  would reach them; Borrower Name/Phone/Email come next, ahead of the
  fast-disqualification fields, since a rep naturally asks who they're talking to
  before diving into property details.
- **"Show the math"** on the qualifying-deal result screen — a collapsible
  breakdown of the actual LTV/equity/factor-rate arithmetic behind the quoted
  range, not just the final numbers (`src/lib/soft-offer.ts`'s `SoftOfferBreakdown`).
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
