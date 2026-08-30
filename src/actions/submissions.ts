"use server";

import { requireActiveShop } from "@/lib/require-shop";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { evaluateLiveRules } from "@/lib/rules-engine";
import { calculateSoftOffer } from "@/lib/soft-offer";
import { sendVpNotificationEmail } from "@/lib/email";
import type { DealFormState } from "@/lib/types";

function toSubmissionRow(shopId: string, form: DealFormState) {
  return {
    shop_id: shopId,
    rep_name: form.rep_name,
    rep_phone: form.rep_phone,
    rep_email: form.rep_email,
    borrower_name: form.borrower_name || null,
    property_address: form.property_address || null,
    property_city: form.property_city || null,
    property_state: form.property_state || null,
    property_zip: form.property_zip || null,
    property_type: form.property_type || null,
    property_subtypes: form.property_subtypes,
    assisted_living_converted_sfr: form.assisted_living_converted_sfr,
    position_sought: form.position_sought || null,
    current_value: form.current_value ? Number(form.current_value) : null,
    current_debt_owed: form.current_debt_owed ? Number(form.current_debt_owed) : null,
    exit_strategy: form.exit_strategy || null,
    use_of_funds: form.use_of_funds || null,
    sole_owner: form.sole_owner === "" ? null : form.sole_owner === "yes",
    co_owner_names: form.co_owner_names || null,
  };
}

// Section 4 note: "Store every submission attempt, including disqualified
// ones." The form has no way for a rep to "submit" a disqualified deal (the
// UI intentionally has no override), so we record it automatically the
// moment the live rules engine disqualifies the deal — see the effect in
// DealForm.tsx. Silently no-ops until rep contact info is present, since
// those columns are NOT NULL.
export async function recordDisqualifiedAttempt(form: DealFormState, reason: string) {
  if (!form.rep_name || !form.rep_phone || !form.rep_email) return;

  const shop = await requireActiveShop();
  const supabase = createAdminClient();
  await supabase.from("submissions").insert({
    ...toSubmissionRow(shop.id, form),
    result_status: "disqualified",
    disqualification_reason: reason,
  });
}

export interface SendToVpResult {
  ok: boolean;
  error?: string;
  vpName?: string;
}

// Authoritative, server-side re-evaluation — never trusts client-computed
// numbers for what gets saved/emailed. Called only from the result screen's
// explicit "Send to VP" button (Section 9).
export async function sendDealToVp(form: DealFormState): Promise<SendToVpResult> {
  const shop = await requireActiveShop();

  if (!form.rep_name || !form.rep_phone || !form.rep_email) {
    return { ok: false, error: "Rep name, phone, and email are required." };
  }
  if (!form.property_state || !form.property_type) {
    return { ok: false, error: "Property state and type are required." };
  }
  if (!form.current_value || Number.isNaN(Number(form.current_value))) {
    return { ok: false, error: "Current property value is required." };
  }
  if (!form.position_sought) {
    return { ok: false, error: "Position sought is required." };
  }
  if (form.position_sought !== "first" && (!form.current_debt_owed || Number.isNaN(Number(form.current_debt_owed)))) {
    return { ok: false, error: "Current debt owed is required for this position." };
  }
  if (!form.exit_strategy) {
    return { ok: false, error: "Exit strategy is required." };
  }
  if (form.sole_owner === "") {
    return { ok: false, error: "Please answer the ownership question." };
  }
  if (form.sole_owner === "no" && !form.co_owner_names.trim()) {
    return { ok: false, error: "Co-owner name(s) are required when the borrower is not the sole owner." };
  }

  const verdict = evaluateLiveRules(form);
  if (verdict.kind === "disqualified") {
    return { ok: false, error: "This deal is disqualified and cannot be sent to the VP." };
  }

  const supabase = createAdminClient();
  const baseRow = toSubmissionRow(shop.id, form);

  if (verdict.kind === "needs_vp_call_alaska") {
    await supabase.from("submissions").insert({
      ...baseRow,
      result_status: "needs_vp_call",
      disqualification_reason: verdict.reason,
    });
    const { vpName } = await sendVpNotificationEmail({
      shopName: shop.shop_name,
      form,
      resultStatus: "needs_vp_call",
      disqualificationReason: verdict.reason,
      softOfferMin: null,
      softOfferMax: null,
      estimatedMonthlyMin: null,
      estimatedMonthlyMax: null,
    });
    return { ok: true, vpName };
  }

  const offer = calculateSoftOffer({
    propertyState: form.property_state,
    propertyType: form.property_type,
    positionSought: form.position_sought,
    currentValue: Number(form.current_value),
    currentDebtOwed: form.current_debt_owed ? Number(form.current_debt_owed) : null,
  });

  if (offer.kind === "needs_vp_call_large_loan") {
    await supabase.from("submissions").insert({
      ...baseRow,
      result_status: "needs_vp_call",
      disqualification_reason: offer.reason,
    });
    const { vpName } = await sendVpNotificationEmail({
      shopName: shop.shop_name,
      form,
      resultStatus: "needs_vp_call",
      disqualificationReason: offer.reason,
      softOfferMin: null,
      softOfferMax: null,
      estimatedMonthlyMin: null,
      estimatedMonthlyMax: null,
    });
    return { ok: true, vpName };
  }

  await supabase.from("submissions").insert({
    ...baseRow,
    result_status: "soft_offer_generated",
    soft_offer_min: offer.softOfferMin,
    soft_offer_max: offer.softOfferMax,
    estimated_monthly_min: offer.estimatedMonthlyMin,
    estimated_monthly_max: offer.estimatedMonthlyMax,
  });

  const { vpName } = await sendVpNotificationEmail({
    shopName: shop.shop_name,
    form,
    resultStatus: "soft_offer_generated",
    disqualificationReason: null,
    softOfferMin: offer.softOfferMin,
    softOfferMax: offer.softOfferMax,
    estimatedMonthlyMin: offer.estimatedMonthlyMin,
    estimatedMonthlyMax: offer.estimatedMonthlyMax,
  });

  return { ok: true, vpName };
}
