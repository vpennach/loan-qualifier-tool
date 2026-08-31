// Section 7 — soft offer calculation engine.
//
// Numbers below were cross-checked against "Updated Product structure.docx"
// (WBL internal closer training), which the spec's Section 7 was itself
// summarizing. Where that doc gave a concrete worked example, we used it to
// confirm or correct the assumptions flagged in the original spec's Section 10.
//
// CONFIRMED by the training doc's worked examples:
//   - Residential factor rate 1.33–1.44 (Example A: 1.35, in-range).
//   - Residential LTV 70%–75% typical / 80% ceiling (Example A: 72% LTV).
//   - 2nd-position cushion of 73%–80% of equity (the dedicated "Equity
//     Formula" example: $375,000 equity -> $275,000-$300,000 offer, which is
//     exactly 73.3%-80% of $375,000).
//
// STILL ASSUMPTIONS (flag to the VP before trusting for a real quote):
//
//   A1. Commercial factor rate low end: the training doc only gives "up to
//       1.63" for commercial, same as the original spec. We use 1.45 as the
//       assumed low end. Example D uses 1.58 for one commercial file, which
//       doesn't resolve the low end either.
//
//   A3. Commercial LTV: the training doc gives NO "typical" for commercial —
//       only "up to 70%" (max). Example D uses exactly 70% LTV. We currently
//       quote a 65%-70% band (65% inherited from the original spec's "Typical"
//       column), but the training doc doesn't actually support a 65% figure
//       anywhere. Worth confirming whether commercial should just be quoted
//       near a single 70% point rather than a range.
//
//   A4. Land and industrial property types have no LTV band, factor rate, or
//       minimum loan size defined anywhere in either source document. We
//       default them to the Commercial numbers as the closer non-residential
//       analog.
//
//   A5. The single-point LTV% plugged into the 2nd-position equity formula
//       (equity = current_value × LTV% − debt): the dedicated worked example
//       uses 75% (the HIGH end of the residential band), but Example B's
//       numbers imply something closer to a direct value with no cushion at
//       all applied. These two examples don't fully agree with each other.
//       We still use the LOW end of the band here (conservative default) —
//       unresolved, flag to the VP.
//
// RESOLVED — minimum loan size (previously implemented as a minimum PROPERTY
// VALUE in rules-engine.ts, which was wrong): the training doc is explicit
// that $100,000 / $250,000 are minimum LOAN sizes, not minimum property
// values. A property can be worth less than $100k and still qualify if the
// position/LTV math works out; a property worth well over $100k can still
// fail the floor in 2nd position after debt is netted out. See
// `minimumLoanThreshold` and `computeOfferRange` below — the live
// disqualification check now runs the same math as the final quote to catch
// this, per rules-engine.ts.

import { CAPPED_LTV_STATES, RESIDENTIAL_PROPERTY_TYPES } from "@/lib/constants";
import type { PositionSought, PropertyType } from "@/lib/types";

interface LtvBand {
  low: number;
  high: number;
}

const CAPPED_STATE_BAND: LtvBand = { low: 0.65, high: 0.7 }; // Section 7.1, explicit — no exceptions
const RESIDENTIAL_STANDARD_BAND: LtvBand = { low: 0.7, high: 0.75 }; // confirmed, see header
const COMMERCIAL_STANDARD_BAND: LtvBand = { low: 0.65, high: 0.7 }; // A3

const RESIDENTIAL_FACTOR_RATE = { low: 1.33, high: 1.44 }; // confirmed, see header
const COMMERCIAL_FACTOR_RATE = { low: 1.45, high: 1.63 }; // A1

const LARGE_LOAN_THRESHOLD = 1_500_000; // Section 7.4
const SECOND_POSITION_CUSHION = { low: 0.73, high: 0.8 }; // confirmed, see header
const AMORTIZATION_MONTHS = 36;

// Minimum LOAN size (not property value) — "Updated Product structure.docx",
// section "Minimum Loan Size". NY residential is the one stated exception.
const RESIDENTIAL_MIN_LOAN = 100_000;
const COMMERCIAL_MIN_LOAN = 250_000; // A4: land/industrial treated as commercial here too
const NY_RESIDENTIAL_MIN_LOAN = 250_000;

export function minimumLoanThreshold(propertyState: string, propertyType: PropertyType): number {
  const isResidential = RESIDENTIAL_PROPERTY_TYPES.includes(propertyType);
  if (isResidential && propertyState === "NY") return NY_RESIDENTIAL_MIN_LOAN;
  return isResidential ? RESIDENTIAL_MIN_LOAN : COMMERCIAL_MIN_LOAN;
}

export function applicableLtvBand(
  propertyState: string,
  propertyType: PropertyType
): LtvBand & { label: string } {
  if (CAPPED_LTV_STATES.includes(propertyState)) {
    return { ...CAPPED_STATE_BAND, label: "NY / MI / MN capped-state band" };
  }
  // A4: land/industrial fall back to the commercial band.
  if (RESIDENTIAL_PROPERTY_TYPES.includes(propertyType)) {
    return { ...RESIDENTIAL_STANDARD_BAND, label: "Residential, standard-state band" };
  }
  return { ...COMMERCIAL_STANDARD_BAND, label: "Commercial, standard-state band" };
}

function applicableFactorRate(propertyType: PropertyType) {
  // A4: land/industrial fall back to the commercial factor rate.
  return RESIDENTIAL_PROPERTY_TYPES.includes(propertyType)
    ? { ...RESIDENTIAL_FACTOR_RATE, label: "Residential factor rate" }
    : { ...COMMERCIAL_FACTOR_RATE, label: "Commercial factor rate" };
}

export interface SoftOfferInput {
  propertyState: string;
  propertyType: PropertyType;
  positionSought: PositionSought;
  currentValue: number;
  currentDebtOwed: number | null; // required for 2nd position / buyout
}

// The raw LTV/equity math, with the minimum-loan-size floor applied to the
// low end of the range (we'll never advertise a number below what we're
// actually willing to lend). Deliberately excludes the $1.5M ceiling check —
// that's a disqualifying override, not part of the range itself — so this
// can be reused by rules-engine.ts to test the floor live, before the rep
// even reaches "Check This Deal".
export function computeOfferRange(input: SoftOfferInput): {
  softOfferMin: number;
  softOfferMax: number;
  equityInCollateral: number | null;
  band: LtvBand & { label: string };
} {
  const band = applicableLtvBand(input.propertyState, input.propertyType);
  let softOfferMin: number;
  let softOfferMax: number;
  let equityInCollateral: number | null = null;

  if (input.positionSought === "first") {
    // Section 7.2
    softOfferMin = input.currentValue * band.low;
    softOfferMax = input.currentValue * band.high;
  } else {
    // Section 7.3 — 2nd position / private lender buyout
    const debt = input.currentDebtOwed ?? 0;
    const applicableLtv = band.low; // A5
    equityInCollateral = input.currentValue * applicableLtv - debt;
    softOfferMin = equityInCollateral * SECOND_POSITION_CUSHION.low;
    softOfferMax = equityInCollateral * SECOND_POSITION_CUSHION.high;
  }

  const threshold = minimumLoanThreshold(input.propertyState, input.propertyType);
  softOfferMin = Math.min(Math.max(softOfferMin, threshold), softOfferMax);

  return { softOfferMin, softOfferMax, equityInCollateral, band };
}

// Step-by-step numbers behind the quoted range, surfaced on the result screen
// so a rep (or anyone checking the tool's work) can see exactly how the
// number was derived rather than trusting a black box.
export interface SoftOfferBreakdown {
  position: PositionSought;
  currentValue: number;
  ltvLow: number;
  ltvHigh: number;
  ltvBandLabel: string;
  currentDebtOwed: number | null;
  equityInCollateral: number | null; // 2nd position / buyout only
  cushionLow: number | null; // 2nd position / buyout only
  cushionHigh: number | null; // 2nd position / buyout only
  factorRateLow: number;
  factorRateHigh: number;
  factorRateLabel: string;
  totalPaybackLow: number;
  totalPaybackHigh: number;
  amortizationMonths: number;
}

export type SoftOfferResult =
  | {
      kind: "needs_vp_call_large_loan";
      reason: string;
    }
  | {
      kind: "soft_offer";
      softOfferMin: number;
      softOfferMax: number;
      estimatedMonthlyMin: number;
      estimatedMonthlyMax: number;
      breakdown: SoftOfferBreakdown;
    };

export function calculateSoftOffer(input: SoftOfferInput): SoftOfferResult {
  const { softOfferMin, softOfferMax, equityInCollateral, band } = computeOfferRange(input);

  // Section 7.4 — large loan override
  if (softOfferMax >= LARGE_LOAN_THRESHOLD) {
    return {
      kind: "needs_vp_call_large_loan",
      reason: "This deal size requires a direct call with the VP before quoting a number.",
    };
  }

  // Section 7.5 — estimated monthly payment
  const factorRate = applicableFactorRate(input.propertyType);
  const totalPaybackLow = softOfferMin * factorRate.low;
  const totalPaybackHigh = softOfferMax * factorRate.high;

  return {
    kind: "soft_offer",
    softOfferMin,
    softOfferMax,
    estimatedMonthlyMin: totalPaybackLow / AMORTIZATION_MONTHS,
    estimatedMonthlyMax: totalPaybackHigh / AMORTIZATION_MONTHS,
    breakdown: {
      position: input.positionSought,
      currentValue: input.currentValue,
      ltvLow: band.low,
      ltvHigh: band.high,
      ltvBandLabel: band.label,
      currentDebtOwed: input.currentDebtOwed,
      equityInCollateral,
      cushionLow: equityInCollateral !== null ? SECOND_POSITION_CUSHION.low : null,
      cushionHigh: equityInCollateral !== null ? SECOND_POSITION_CUSHION.high : null,
      factorRateLow: factorRate.low,
      factorRateHigh: factorRate.high,
      factorRateLabel: factorRate.label,
      totalPaybackLow,
      totalPaybackHigh,
      amortizationMonths: AMORTIZATION_MONTHS,
    },
  };
}
