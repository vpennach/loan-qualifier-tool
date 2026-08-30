# Build Spec: Iso-Shop Loan Pre-Qualification Tool

## 1. What This Tool Does

A web tool for iso-shop sales reps to use live, on the phone with a client, to determine in real time whether a collateralized real estate loan deal will qualify — and if it does, generate a soft offer range (min/max loan amount + estimated monthly payment) they can quote to the client on the spot.

The goal: stop reps from spending 20+ minutes gathering full deal info on something that was disqualified from the first answer (wrong state, wrong property type, etc.), and stop the VP of Sales from spending his time rejecting submissions that should never have made it to him.

This is a **Phase 1 prototype**. It intentionally does NOT include a VP review dashboard yet — the VP has not yet specified what that screen should look like. Phase 1 ends with an email to the VP containing the full deal details whenever a rep completes a qualifying submission. The VP dashboard is Phase 2, to be scoped after he sees Phase 1 in action.

---

## 2. Recommended Tech Stack

- **Framework:** Next.js (single app serves both the rep-facing tool and, later, the VP dashboard)
- **Database + Auth:** Supabase (hosted Postgres, includes auth tooling we'll partially use for admin accounts)
- **Hosting:** Vercel
- **Email sending:** Resend (or similar transactional email API) for the VP notification
- **Styling:** Tailwind CSS

Claude Code should scaffold a new Next.js project (App Router) with Supabase as the backend, structured so a VP dashboard can be added later without restructuring the data model.

---

## 3. User Roles

### Shop Rep (no individual account)
- Authenticates with a **shared shop code** (not a personal username/password)
- Enters their own name, phone, and email **on every submission** (not at login) so the VP knows who to contact about that specific deal
- Once a shop code is entered successfully in a browser, remember that session (cookie) so they aren't re-entering the code on every call

### Admin (multiple people: VP + other employees who onboard shops)
- Real email/password account (use Supabase Auth for this)
- Can create new shop codes, view the list of shops, and deactivate a shop's code (revokes access for everyone at that shop instantly)
- Do NOT build shop-code creation as VP-only — any Admin-role account can do this

*(Note: whether Admins can also see submission data/deal review is undecided — do not build that access control assumption yet. Keep Admin's permissions scoped to shop management only for Phase 1.)*

---

## 4. Data Model

### `shops`
| field | type | notes |
|---|---|---|
| id | uuid | primary key |
| shop_name | text | |
| shop_code | text, unique | the shared login code |
| active | boolean | default true; flipping to false blocks all login attempts using this code |
| created_at | timestamp | |
| created_by | reference to admin user | |

### `admin_users`
Use Supabase Auth's built-in user table for this; no custom table needed beyond marking a role/flag of `admin`.

### `submissions`
| field | type | notes |
|---|---|---|
| id | uuid | primary key |
| shop_id | reference to shops | which shop this came from |
| rep_name | text | required |
| rep_phone | text | required |
| rep_email | text | required |
| borrower_name | text | |
| property_address | text | |
| property_city | text | |
| property_state | text (2-letter code) | |
| property_zip | text | |
| property_type | enum | see Section 6 for allowed values |
| position_sought | enum | `first`, `second_behind_bank`, `private_lender_buyout` |
| current_value | numeric | |
| current_debt_owed | numeric | total of all existing liens on the property |
| exit_strategy | enum | `sale`, `refinance`, `business_proceeds`, `no_plan_yet` |
| use_of_funds | text | |
| sole_owner | boolean | does the borrower own the property 100% themselves? |
| co_owner_names | text, nullable | required if `sole_owner` is false — name(s) of other owner(s) who will need to sign an affidavit |
| result_status | enum | `disqualified`, `soft_offer_generated`, `needs_vp_call` (for the $1.5M+ case and Alaska case) |
| disqualification_reason | text, nullable | plain-English reason shown to the rep, stored for records |
| soft_offer_min | numeric, nullable | |
| soft_offer_max | numeric, nullable | |
| estimated_monthly_min | numeric, nullable | |
| estimated_monthly_max | numeric, nullable | |
| created_at | timestamp | |

Store every submission attempt, including disqualified ones — this data will matter later for understanding deal flow and possibly retraining the rules.

---

## 5. Authentication Flow

1. Landing page asks for a shop code only.
2. On submit, check `shops` table for a matching, active `shop_code`.
   - Match + active → set a session cookie, redirect to the deal form.
   - No match, or match but `active = false` → show a generic "invalid code" error. Do not distinguish between "wrong code" and "deactivated shop" in the error message shown to the rep (avoid leaking which codes exist/existed).
3. Session cookie persists across visits until manually cleared or the shop is deactivated.
4. Separate `/admin/login` route uses real Supabase email/password auth for Admin users, completely separate from the shop-code flow.

---

## 6. The Rules Engine — Disqualification Logic

This is the core logic of the tool. It must run **live, field-by-field, as the rep fills out the form** — not only when a "submit" or "check deal" button is pressed. The moment enough information is present to know a deal is dead, the form must visibly lock and warn the rep, before they waste time collecting the rest of the fields.

### 6.1 Property type options (enum)
```
primary_residence
residential_rental_investment
commercial
land
industrial
```
Also collect enough detail to catch these specific excluded sub-types (consider a secondary "property subtype" free-text or checklist the rep confirms with the client):
- Vacant commercial or vacant industrial
- Cemetery
- Church
- Quarry / mine
- Funeral home
- Medical facility (hospital, urgent care, nursing home, rehab center)
- Assisted living facility (EXCEPT a converted single-family residence — allow this exception)
- Gas station
- Golf course
- Ground-up construction / early-stage construction
- Dilapidated or fire-damaged property

**Rule 6.1:** If property subtype matches any item in the excluded list above (with the SFR-converted-assisted-living exception carved out), disqualify immediately. Reason shown to rep: *"This property type is not eligible for collateral."*

### 6.2 State-based hard disqualifiers

**Full state ban (any property type):**
```
AZ, HI, MT, NV, ND, PR, SD, VI (US Virgin Islands), VT, WV
```
**Rule:** If `property_state` is in this list, disqualify immediately regardless of any other field. Reason: *"We do not currently lend in [state]."*

**Residential-only state ban:**
```
ID, IA, OR, UT
```
**Rule:** If `property_state` is in this list AND `property_type` is `primary_residence` or `residential_rental_investment`, disqualify. Reason: *"We do not lend on residential property in [state]."* (Commercial/land/industrial in these states is NOT automatically disqualified by this rule.)

**Minnesota — special case:**
**Rule:** If `property_state == MN` AND `property_type` is anything other than `commercial`, disqualify. Reason: *"Minnesota properties are only eligible if the collateral is commercial."* Minnesota commercial deals proceed normally but fall into the special LTV-cap group (see Section 7).

**Massachusetts / Texas — primary residence only:**
**Rule:** If `property_state` is `MA` or `TX` AND `property_type == primary_residence`, disqualify. Reason: *"Primary residences in [state] are not eligible; rental, vacation, or commercial properties in this state are fine."* Note explicitly to the rep that this exclusion does NOT apply to rental/vacation/commercial in these states.

**Alaska — flag, don't auto-decide:**
**Rule:** If `property_state == AK`, do not disqualify and do not generate an automatic soft offer. Instead, set `result_status = needs_vp_call` and show the rep a message: *"Alaska properties are handled case-by-case — this deal needs a direct call with the VP before quoting anything."* Let the rep continue filling out the rest of the form for record-keeping, but no soft-offer numbers should be calculated or displayed.

### 6.3 Value floor

**Rule:** If `current_value < 100000`, disqualify. Reason: *"Property value is below our $100,000 minimum."*

**New York override:** If `property_state == NY` AND `property_type` involves residential (`primary_residence` or `residential_rental_investment`) AND `current_value < 250000`, disqualify. Reason: *"New York residential properties require a minimum value of $250,000."*

### 6.4 Order of evaluation

Evaluate in this order as fields are filled in, so the earliest-available field triggers a check as soon as possible:
1. `property_state` alone → check full state ban
2. `property_state` + `property_type` (as soon as both present) → check residential-only bans, Minnesota rule, MA/TX rule
3. `property_type` / subtype alone → check excluded property types
4. `current_value` (as soon as entered) → check value floor (including NY override, which needs `property_state` + `property_type` + `current_value` all present)

Any time a later field change would have changed an earlier verdict (e.g., rep changes the state after already entering a value), re-run all checks against the current full set of answers.

---

## 7. Soft Offer Calculation

Only runs if the deal has passed every check in Section 6, and `position_sought`, `current_value`, and (if applicable) `current_debt_owed` are filled in.

### 7.1 LTV bands to use

| Group | Typical / Default LTV | Max LTV (clean file) |
|---|---|---|
| Residential, 1st position, standard states | 70%–75% | 80% |
| Residential, 1st position, NY / MI / MN(commercial-only, see below) | up to 65%–70% (this IS the ceiling, no exceptions) | same — no ceiling above this |
| Commercial, 1st position, standard states | 65% | 70% |
| Commercial, 1st position, NY / MI / MN | up to 65%–70% (same capped-state ceiling) | same |
| 2nd position (any state) | N/A — sized via equity formula below | 70% CLTV cap |

"NY / MI / MN capped-state group": New York, Michigan, and Minnesota (Minnesota only reaches this step at all if `property_type == commercial`, per Rule in 6.2). For this group, use 65% as the low end and 70% as the high end of the quoted range — do not offer anything above 70% for these three states under any circumstance.

### 7.2 1st position calculation

```
soft_offer_min = current_value × (low end of applicable LTV band)
soft_offer_max = current_value × (high end of applicable LTV band)
```

### 7.3 2nd position / private lender buyout calculation

Use the equity formula first:
```
equity_in_collateral = (current_value × applicable_LTV%) − current_debt_owed
```
Then size the offer as a cushion below that equity figure — quote a range roughly 73%–80% of `equity_in_collateral` as the min/max offer (this matches the worked example in the underlying training material). Use the standard LTV% for the applicable state group (same bands as above) as the LTV% in this formula.

```
soft_offer_min = equity_in_collateral × 0.73
soft_offer_max = equity_in_collateral × 0.80
```

### 7.4 Large loan override

**Rule:** After calculating `soft_offer_max`, if `soft_offer_max >= 1,500,000`, do NOT display a soft offer range. Instead set `result_status = needs_vp_call` and show: *"This deal size requires a direct call with the VP before quoting a number."*

### 7.5 Estimated monthly payment

Using the factor rate ranges from the underlying training material:
- Residential: factor rate range 1.33–1.44
- Commercial: factor rate range up to 1.63 (use 1.45–1.63 as a reasonable working range for the low/high display, since no explicit low-end commercial factor rate is specified — flag this as an assumption to confirm with the VP)

```
total_payback_low = soft_offer_min × low_factor_rate
total_payback_high = soft_offer_max × high_factor_rate
estimated_monthly_min = total_payback_low / 36
estimated_monthly_max = total_payback_high / 36
```

Display both the loan amount range and the monthly payment range together on the result screen — the training material is explicit that borrowers respond to the monthly dollar figure more than the loan amount or factor rate itself.

---

## 8. Form UX Behavior

- The form should NOT have a traditional "fill everything out, then submit" feel. Fields relevant to fast disqualification (state, property type, value) should be positioned early in the form.
- The moment a disqualifying combination is detected (per Section 6.4), show a **persistent, visually prominent warning banner** (e.g., red background, warning icon) directly on the form with the plain-English reason.
- **Lock all fields below/after the triggering field(s)** — the rep cannot continue filling out the rest of the form while a disqualifying condition is active. Fields already filled in remain visible but the "Check This Deal" action and any subsequent fields are disabled.
- The warning is **not dismissible** by the rep directly. It only clears automatically once the rep changes the offending field(s) to a value that no longer triggers a rule. There is no "I understand, continue anyway" override — this is intentional; do not build one even if it seems convenient.
- Once all fields are filled and no disqualifying condition is active, the rep can trigger a final calculation (button: "Check This Deal") which runs the Section 7 math and shows the result screen.
- For the `needs_vp_call` case (Alaska, or $1.5M+ deals), show a distinct screen (not red/error styled, more neutral/informational) directing the rep to loop in the VP directly rather than implying anything is wrong with the deal.
- **Property ownership question:** ask "Does the borrower own the property 100% themselves, or is there anyone else on title?" This is NOT a disqualifier and does not lock the form. If the rep indicates there's a co-owner, show an informational (not red/blocking) note: *"An affidavit will be required from [co-owner name] before closing — make sure to get their name and let the client know."* Capture the co-owner name(s) as a required field once "not sole owner" is selected, so it carries through to the VP email in Section 9.

---

## 9. Submission / VP Notification

When a rep reaches a `soft_offer_generated` or `needs_vp_call` result and confirms they want to move forward (add a "Send to VP" button on the result screen — do not auto-email on every keystroke, only on explicit rep action):

1. Save the full submission record to the `submissions` table with the appropriate `result_status`.
2. Send an email (via Resend or equivalent) to the VP's email address containing: rep name/phone/email, shop name, borrower name, full property details, position sought, calculated soft offer range (or the reason it needs a VP call), and exit strategy.
3. Show the rep a confirmation screen: "Sent to [VP name] — they'll follow up with an official pre-qualifying offer."

Do NOT build a dashboard/queue view for the VP in this phase — email is the full extent of the VP-facing functionality for now. Structure the `submissions` table so a dashboard can be added later without a schema change.

---

## 10. Open Items / Assumptions to Flag Back to the Product Owner

Claude Code should NOT silently resolve these — surface them clearly if encountered, and use the stated assumption as a placeholder:

1. **Commercial factor rate low end** — assumed 1.45 in Section 7.5; the source material only specifies "up to 1.63." Confirm actual low end with the VP.
2. **2nd position cushion percentages (73%–80% of equity)** — derived from a single worked example in training material, not an explicit stated rule. Confirm this is the correct general formula, not just true for that one example.
3. **Admin permissions** — whether onboarding employees (non-VP admins) should eventually see submission data is still undecided. Built with Admin scoped to shop management only; do not expand this without explicit confirmation.
4. **VP dashboard (Phase 2)** — entirely unscoped. Do not attempt to design or build this yet.

---

## 11. Suggested Build Order

1. Scaffold Next.js + Supabase + Tailwind project; set up `shops` and `submissions` tables.
2. Build shop-code login flow and session handling.
3. Build Admin login (Supabase Auth) + simple admin screen to create/deactivate shop codes.
4. Build the deal form UI with all fields from Section 4, without live validation yet — just a working form that saves a `submissions` row.
5. Layer in the live disqualification rules engine (Section 6), field-by-field, with the locking/warning banner behavior (Section 8).
6. Add the soft-offer calculation engine (Section 7) and the result screens (disqualified / soft offer / needs VP call).
7. Add the "Send to VP" action and email integration (Section 9).
8. Test the full flow end-to-end with a handful of realistic scenarios covering: a clean qualifying deal, each type of disqualification, the Alaska case, the $1.5M+ case, and a 2nd-position deal.
9. Deploy to Vercel, connect custom domain.
