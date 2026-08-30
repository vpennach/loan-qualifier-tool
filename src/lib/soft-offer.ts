// Section 7 — soft offer calculation engine.
//
// ASSUMPTIONS FLAGGED PER SECTION 10 (do not silently trust these — confirm
// with the VP before relying on this tool for real quotes):
//
//   A1. Commercial factor rate low end (Section 7.5): the source material only
//       gives "up to 1.63" for commercial. We use 1.45 as the assumed low end.
//
//   A2. 2nd-position cushion of 73%-80% of equity (Section 7.3): derived from a
//       single worked example, not a stated general rule.
//
//   A3. LTV band low/high when Section 7.1's table gives a single "Typical"
//       number instead of a range (commercial, standard states: "65%" typical,
//       "70%" max clean file). We treat [Typical, Max clean file] as the quoted
//       [low, high] band in that case. Where Typical is already a range
//       (residential, standard states: 70%-75%), we use that range as-is and
//       treat "Max clean file" (80%) as an unused informational ceiling, NOT
//       part of the quoted range. This is an inference, not a stated rule —
//       confirm with the VP.
//
//   A4. Land and industrial property types have NO LTV band or factor rate
//       defined anywhere in Section 7 (only "Residential" and "Commercial" rows
//       exist). We default them to the Commercial band/factor rate as the
//       closer non-residential analog. Confirm with the VP — this is a gap in
//       the source material, not a resolved rule.
//
//   A5. The single-point "applicable_LTV%" plugged into the Section 7.3 equity
//       formula (equity_in_collateral = current_value × applicable_LTV% − debt)
//       needs one number, but Section 7.1's bands are ranges. We use the LOW
//       end of the applicable band (the conservative/"Typical" default). Confirm
//       with the VP — the source material doesn't specify which point in the
//       band to use here.

import { CAPPED_LTV_STATES, RESIDENTIAL_PROPERTY_TYPES } from "@/lib/constants";
import type { PositionSought, PropertyType } from "@/lib/types";

interface LtvBand {
  low: number;
  high: number;
}

const CAPPED_STATE_BAND: LtvBand = { low: 0.65, high: 0.7 }; // Section 7.1, explicit — no exceptions
const RESIDENTIAL_STANDARD_BAND: LtvBand = { low: 0.7, high: 0.75 }; // A3
const COMMERCIAL_STANDARD_BAND: LtvBand = { low: 0.65, high: 0.7 }; // A3 (Typical -> Max clean file)

const RESIDENTIAL_FACTOR_RATE = { low: 1.33, high: 1.44 };
const COMMERCIAL_FACTOR_RATE = { low: 1.45, high: 1.63 }; // A1

const LARGE_LOAN_THRESHOLD = 1_500_000; // Section 7.4
const SECOND_POSITION_CUSHION = { low: 0.73, high: 0.8 }; // A2
const AMORTIZATION_MONTHS = 36;

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
