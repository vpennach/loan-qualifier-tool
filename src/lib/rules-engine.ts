// Section 6 — the live, field-by-field disqualification rules engine.
//
// evaluateLiveRules() is a pure function re-run from scratch on every keystroke
// (per Section 6.4: "Any time a later field change would have changed an earlier
// verdict... re-run all checks against the current full set of answers"). Rules
// are checked in the exact priority order laid out in Section 6.4 — the first
// one that fires wins, and its `lockFromField` tells the UI which field to lock
// *after* (the triggering field itself stays editable so the rep can fix it).

import {
  FULL_BAN_STATES,
  RESIDENTIAL_ONLY_BAN_STATES,
  RESIDENTIAL_PROPERTY_TYPES,
  stateName,
} from "@/lib/constants";
import type { DealFormState } from "@/lib/types";

// Order the disqualification-relevant fields appear in the form. Used to
// determine which fields come "after" a triggering field for locking.
export const FIELD_ORDER = [
  "borrower_name",
  "borrower_phone",
  "borrower_email",
  "property_state",
  "property_type",
  "property_subtypes",
  "current_value",
  "property_address",
  "property_city",
  "property_zip",
  "position_sought",
  "current_debt_owed",
  "sole_owner",
  "co_owner_names",
  "exit_strategy",
  "use_of_funds",
] as const;

export type FieldKey = (typeof FIELD_ORDER)[number];

export type LiveVerdict =
  | { kind: "clean" }
  | { kind: "disqualified"; reason: string; lockFromField: FieldKey }
  | { kind: "needs_vp_call_alaska"; reason: string };

const ALASKA_MESSAGE =
  "Alaska properties are handled case-by-case — this deal needs a direct call with the VP before quoting anything.";

export function evaluateLiveRules(form: DealFormState): LiveVerdict {
  const state = form.property_state || null;
  const type = form.property_type || null;
  const value = form.current_value === "" ? null : Number(form.current_value);

  // --- 1. property_state alone: full state ban ---
  if (state && FULL_BAN_STATES.includes(state)) {
    return {
      kind: "disqualified",
      reason: `We do not currently lend in ${stateName(state)}.`,
      lockFromField: "property_state",
    };
  }

  // --- 2. property_state + property_type: residential-only ban, MN, MA/TX ---
  if (state && type) {
    if (RESIDENTIAL_ONLY_BAN_STATES.includes(state) && RESIDENTIAL_PROPERTY_TYPES.includes(type)) {
      return {
        kind: "disqualified",
        reason: `We do not lend on residential property in ${stateName(state)}.`,
        lockFromField: "property_type",
      };
    }

    if (state === "MN" && type !== "commercial") {
      return {
        kind: "disqualified",
        reason: "Minnesota properties are only eligible if the collateral is commercial.",
        lockFromField: "property_type",
      };
    }

    if ((state === "MA" || state === "TX") && type === "primary_residence") {
      return {
        kind: "disqualified",
        reason: `Primary residences in ${stateName(
          state
        )} are not eligible; rental, vacation, or commercial properties in this state are fine.`,
        lockFromField: "property_type",
      };
    }
  }

  // --- 3. property_type / subtype alone: excluded property types (6.1) ---
  const hasExcludedSubtype = form.property_subtypes.some((flag) => {
    if (flag === "assisted_living_facility") {
      // Converted single-family residence is the one carved-out exception.
      return !form.assisted_living_converted_sfr;
    }
    return true;
  });
  if (hasExcludedSubtype) {
    return {
      kind: "disqualified",
      reason: "This property type is not eligible for collateral.",
      lockFromField: "property_subtypes",
    };
  }

  // --- 4. current_value: value floor, with NY residential override ---
  if (value !== null && !Number.isNaN(value)) {
    const isNyResidential = state === "NY" && type !== null && RESIDENTIAL_PROPERTY_TYPES.includes(type);
    const floor = isNyResidential ? 250000 : 100000;

    if (value < floor) {
      return {
        kind: "disqualified",
        reason: isNyResidential
          ? "New York residential properties require a minimum value of $250,000."
          : "Property value is below our $100,000 minimum.",
        lockFromField: "current_value",
      };
    }
  }

  // --- Alaska: flagged for a VP call, not a disqualification ---
  if (state === "AK") {
    return { kind: "needs_vp_call_alaska", reason: ALASKA_MESSAGE };
  }

  return { kind: "clean" };
}

export function lockedFieldIndex(verdict: LiveVerdict): number {
  if (verdict.kind !== "disqualified") return FIELD_ORDER.length; // nothing locked
  return FIELD_ORDER.indexOf(verdict.lockFromField);
}

export function isFieldLocked(field: FieldKey, verdict: LiveVerdict): boolean {
  const lockIndex = lockedFieldIndex(verdict);
  return FIELD_ORDER.indexOf(field) > lockIndex;
}
