// Section 11, step 8 — end-to-end scenario checks for the pure rules/calc
// logic (no DB/network). Run with: npm run test:scenarios

import { evaluateLiveRules } from "../src/lib/rules-engine";
import { calculateSoftOffer } from "../src/lib/soft-offer";
import { EMPTY_DEAL_FORM_STATE, type DealFormState } from "../src/lib/types";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
}

function form(overrides: Partial<DealFormState>): DealFormState {
  return { ...EMPTY_DEAL_FORM_STATE, ...overrides };
}

// 1. Clean qualifying deal — residential, 1st position, standard state
{
  const f = form({
    property_state: "CA",
    property_type: "primary_residence",
    current_value: "500000",
    position_sought: "first",
  });
  check("clean deal: verdict", evaluateLiveRules(f).kind, "clean");
  const offer = calculateSoftOffer({
    propertyState: "CA",
    propertyType: "primary_residence",
    positionSought: "first",
    currentValue: 500000,
    currentDebtOwed: null,
  });
  check("clean deal: offer", offer.kind === "soft_offer" ? {
    kind: offer.kind,
    softOfferMin: offer.softOfferMin,
    softOfferMax: offer.softOfferMax,
    estimatedMonthlyMin: offer.estimatedMonthlyMin,
    estimatedMonthlyMax: offer.estimatedMonthlyMax,
  } : offer, {
    kind: "soft_offer",
    softOfferMin: 350000,
    softOfferMax: 375000,
    estimatedMonthlyMin: (350000 * 1.33) / 36,
    estimatedMonthlyMax: (375000 * 1.44) / 36,
  });
  check(
    "clean deal: breakdown LTV band",
    offer.kind === "soft_offer" ? [offer.breakdown.ltvLow, offer.breakdown.ltvHigh] : null,
    [0.7, 0.75]
  );
}

// 2. Full state ban (Nevada)
{
  const f = form({ property_state: "NV" });
  const verdict = evaluateLiveRules(f);
  check("full state ban: kind", verdict.kind, "disqualified");
  check(
    "full state ban: lockFromField",
    verdict.kind === "disqualified" ? verdict.lockFromField : null,
    "property_state"
  );
}

// 3. Residential-only ban (Oregon)
{
  const f = form({ property_state: "OR", property_type: "primary_residence" });
  check("residential-only ban: kind", evaluateLiveRules(f).kind, "disqualified");
  const f2 = form({ property_state: "OR", property_type: "commercial", current_value: "500000" });
  check("residential-only ban does not affect commercial", evaluateLiveRules(f2).kind, "clean");
}

// 4. Minnesota rule
{
  const f = form({ property_state: "MN", property_type: "primary_residence" });
  check("MN non-commercial disqualified", evaluateLiveRules(f).kind, "disqualified");
  const f2 = form({ property_state: "MN", property_type: "commercial", current_value: "500000" });
  check("MN commercial clean", evaluateLiveRules(f2).kind, "clean");
}

// 5. MA/TX primary residence rule
{
  const f = form({ property_state: "MA", property_type: "primary_residence" });
  check("MA primary residence disqualified", evaluateLiveRules(f).kind, "disqualified");
  const f2 = form({ property_state: "TX", property_type: "commercial", current_value: "500000" });
  check("TX commercial clean", evaluateLiveRules(f2).kind, "clean");
}

// 6. Excluded property subtype
{
  const f = form({ property_state: "CA", property_type: "commercial", property_subtypes: ["gas_station"] });
  check("gas station disqualified", evaluateLiveRules(f).kind, "disqualified");
}

// 6b. Assisted living exception
{
  const f = form({
    property_state: "CA",
    property_type: "residential_rental_investment",
    property_subtypes: ["assisted_living_facility"],
    assisted_living_converted_sfr: true,
  });
  check("assisted living converted SFR allowed", evaluateLiveRules(f).kind, "clean");
  const f2 = form({
    property_state: "CA",
    property_type: "residential_rental_investment",
    property_subtypes: ["assisted_living_facility"],
    assisted_living_converted_sfr: false,
  });
  check("assisted living non-converted disqualified", evaluateLiveRules(f2).kind, "disqualified");
}

// 7. Minimum LOAN size floor (not a minimum property value) — residential
// $100k, commercial $250k, NY residential $250k. A property can be worth
// less than the floor and still qualify if the computed max loan clears it,
// and a property worth well over the floor can still fail it.
{
  // $150k property, CA residential, 1st position -> range $105k-$112.5k.
  // Well above the OLD (wrong) $100k value floor, and the computed loan max
  // clears $100k too, so this must NOT be disqualified.
  const f = form({
    property_state: "CA",
    property_type: "primary_residence",
    current_value: "150000",
    position_sought: "first",
  });
  check("property worth $150k, loan range clears $100k floor: clean", evaluateLiveRules(f).kind, "clean");
}
{
  // $120k property, CA residential, 1st position -> range $84k-$90k. Max
  // loan ($90k) is below the $100k floor even though the property itself
  // isn't absurdly cheap — this is the exact case that was missed before.
  const f = form({
    property_state: "CA",
    property_type: "primary_residence",
    current_value: "120000",
    position_sought: "first",
  });
  check("max loan below $100k floor disqualified", evaluateLiveRules(f).kind, "disqualified");
}
{
  // $140k property, CA residential, 1st position -> range $98k-$105k.
  // Straddles the floor: NOT disqualified (max clears $100k), but the final
  // quote's displayed min must be clamped up to $100k, never shown as $98k.
  const offer = calculateSoftOffer({
    propertyState: "CA",
    propertyType: "primary_residence",
    positionSought: "first",
    currentValue: 140000,
    currentDebtOwed: null,
  });
  check(
    "straddling range clamps min to $100k floor",
    offer.kind === "soft_offer" ? offer.softOfferMin : null,
    100000
  );
}
{
  // $300k commercial property, CA, 1st position, standard band 65%-70% ->
  // range $195k-$210k. Max ($210k) is below the $250k commercial floor.
  const f = form({
    property_state: "CA",
    property_type: "commercial",
    current_value: "300000",
    position_sought: "first",
  });
  check("commercial max loan below $250k floor disqualified", evaluateLiveRules(f).kind, "disqualified");
}
{
  // $350k residential in NY (capped-state band 65%-70%) -> range
  // $227.5k-$245k. Max ($245k) is below the NY-residential-specific $250k
  // floor, even though the general residential floor is only $100k.
  const f = form({
    property_state: "NY",
    property_type: "primary_residence",
    current_value: "350000",
    position_sought: "first",
  });
  check("NY residential max loan below $250k floor disqualified", evaluateLiveRules(f).kind, "disqualified");

  // Same value, non-NY state -> standard 70%-75% band -> range
  // $245k-$262.5k, clears the general $100k residential floor.
  const f2 = form({
    property_state: "CA",
    property_type: "primary_residence",
    current_value: "350000",
    position_sought: "first",
  });
  check("same value outside NY clears general $100k floor: clean", evaluateLiveRules(f2).kind, "clean");
}

// 8. Alaska case
{
  const f = form({ property_state: "AK", property_type: "commercial", current_value: "500000" });
  check("Alaska needs_vp_call_alaska", evaluateLiveRules(f).kind, "needs_vp_call_alaska");
}

// 9. $1.5M+ large loan override
{
  const offer = calculateSoftOffer({
    propertyState: "CA",
    propertyType: "commercial",
    positionSought: "first",
    currentValue: 3000000,
    currentDebtOwed: null,
  });
  check("large loan triggers needs_vp_call", offer.kind, "needs_vp_call_large_loan");
}

// 10. 2nd position calc
{
  const offer = calculateSoftOffer({
    propertyState: "CA",
    propertyType: "primary_residence",
    positionSought: "second_behind_bank",
    currentValue: 500000,
    currentDebtOwed: 200000,
  });
  check("2nd position offer", offer.kind === "soft_offer" ? {
    kind: offer.kind,
    softOfferMin: offer.softOfferMin,
    softOfferMax: offer.softOfferMax,
    estimatedMonthlyMin: offer.estimatedMonthlyMin,
    estimatedMonthlyMax: offer.estimatedMonthlyMax,
  } : offer, {
    kind: "soft_offer",
    softOfferMin: 109500,
    softOfferMax: 120000,
    estimatedMonthlyMin: (109500 * 1.33) / 36,
    estimatedMonthlyMax: (120000 * 1.44) / 36,
  });
  check(
    "2nd position offer: breakdown equity",
    offer.kind === "soft_offer" ? offer.breakdown.equityInCollateral : null,
    150000
  );
}

// 11. Capped-state band (NY/MI/MN)
{
  const offer = calculateSoftOffer({
    propertyState: "MI",
    propertyType: "commercial",
    positionSought: "first",
    currentValue: 1000000,
    currentDebtOwed: null,
  });
  check("MI capped band", offer.kind === "soft_offer" ? {
    kind: offer.kind,
    softOfferMin: offer.softOfferMin,
    softOfferMax: offer.softOfferMax,
    estimatedMonthlyMin: offer.estimatedMonthlyMin,
    estimatedMonthlyMax: offer.estimatedMonthlyMax,
  } : offer, {
    kind: "soft_offer",
    softOfferMin: 650000,
    softOfferMax: 700000,
    estimatedMonthlyMin: (650000 * 1.45) / 36,
    estimatedMonthlyMax: (700000 * 1.63) / 36,
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
