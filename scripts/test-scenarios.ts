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
  check("clean deal: offer", offer, {
    kind: "soft_offer",
    softOfferMin: 350000,
    softOfferMax: 375000,
    estimatedMonthlyMin: (350000 * 1.33) / 36,
    estimatedMonthlyMax: (375000 * 1.44) / 36,
  });
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

// 7. Value floor
{
  const f = form({ property_state: "CA", property_type: "commercial", current_value: "50000" });
  check("below value floor disqualified", evaluateLiveRules(f).kind, "disqualified");
}

// 7b. NY residential override
{
  const f = form({ property_state: "NY", property_type: "primary_residence", current_value: "200000" });
  check("NY residential below 250k disqualified", evaluateLiveRules(f).kind, "disqualified");
  const f2 = form({ property_state: "NY", property_type: "commercial", current_value: "150000" });
  check("NY commercial 150k not disqualified by NY override", evaluateLiveRules(f2).kind, "clean");
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
  check("2nd position offer", offer, {
    kind: "soft_offer",
    softOfferMin: 109500,
    softOfferMax: 120000,
    estimatedMonthlyMin: (109500 * 1.33) / 36,
    estimatedMonthlyMax: (120000 * 1.44) / 36,
  });
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
  check("MI capped band", offer, {
    kind: "soft_offer",
    softOfferMin: 650000,
    softOfferMax: 700000,
    estimatedMonthlyMin: (650000 * 1.45) / 36,
    estimatedMonthlyMax: (700000 * 1.63) / 36,
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
