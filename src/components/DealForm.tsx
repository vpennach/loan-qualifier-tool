"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  EMPTY_DEAL_FORM_STATE,
  EXIT_STRATEGY_OPTIONS,
  POSITION_SOUGHT_OPTIONS,
  PROPERTY_SUBTYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  type DealFormState,
  type PositionSought,
  type PropertySubtypeFlag,
  type PropertyType,
} from "@/lib/types";
import { STATE_OPTIONS } from "@/lib/constants";
import { evaluateLiveRules, isFieldLocked, type FieldKey } from "@/lib/rules-engine";
import { calculateSoftOffer } from "@/lib/soft-offer";
import { recordDisqualifiedAttempt, sendDealToVp } from "@/actions/submissions";
import { WarningBanner } from "@/components/WarningBanner";
import { ResultScreen, type DealResult } from "@/components/ResultScreen";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
const labelClass = "block text-sm font-medium text-slate-700";

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function DealForm() {
  const [form, setForm] = useState<DealFormState>(EMPTY_DEAL_FORM_STATE);
  const [stage, setStage] = useState<"form" | "result">("form");
  const [result, setResult] = useState<DealResult | null>(null);

  const [sending, startSending] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [vpName, setVpName] = useState<string | null>(null);

  const lastRecordedReason = useRef<string | null>(null);

  const verdict = evaluateLiveRules(form);

  function locked(field: FieldKey) {
    return isFieldLocked(field, verdict);
  }

  function update<K extends keyof DealFormState>(key: K, value: DealFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSubtype(flag: PropertySubtypeFlag) {
    setForm((prev) => {
      const has = prev.property_subtypes.includes(flag);
      return {
        ...prev,
        property_subtypes: has
          ? prev.property_subtypes.filter((f) => f !== flag)
          : [...prev.property_subtypes, flag],
        assisted_living_converted_sfr: flag === "assisted_living_facility" && has ? false : prev.assisted_living_converted_sfr,
      };
    });
  }

  // Section 4: store every submission attempt, including disqualified ones.
  // There's no submit button on a blocked form, so record automatically.
  useEffect(() => {
    if (verdict.kind !== "disqualified") return;
    if (!form.rep_name || !form.rep_phone || !form.rep_email) return;
    if (lastRecordedReason.current === verdict.reason) return;
    lastRecordedReason.current = verdict.reason;
    recordDisqualifiedAttempt(form, verdict.reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict.kind === "disqualified" ? verdict.reason : null]);

  const needsDebt = form.position_sought !== "" && form.position_sought !== "first";

  const canCheckDeal =
    verdict.kind !== "disqualified" &&
    !!form.rep_name &&
    !!form.rep_phone &&
    !!form.rep_email &&
    !!form.property_state &&
    !!form.property_type &&
    !!form.current_value &&
    !!form.position_sought &&
    (!needsDebt || !!form.current_debt_owed) &&
    !!form.exit_strategy &&
    form.sole_owner !== "" &&
    (form.sole_owner !== "no" || !!form.co_owner_names.trim());

  function handleCheckDeal() {
    if (!canCheckDeal) return;

    if (verdict.kind === "needs_vp_call_alaska") {
      setResult({ status: "needs_vp_call", reason: verdict.reason });
      setStage("result");
      return;
    }

    const offer = calculateSoftOffer({
      propertyState: form.property_state,
      propertyType: form.property_type as PropertyType,
      positionSought: form.position_sought as PositionSought,
      currentValue: Number(form.current_value),
      currentDebtOwed: form.current_debt_owed ? Number(form.current_debt_owed) : null,
    });

    if (offer.kind === "needs_vp_call_large_loan") {
      setResult({ status: "needs_vp_call", reason: offer.reason });
    } else {
      setResult({
        status: "soft_offer_generated",
        softOfferMin: offer.softOfferMin,
        softOfferMax: offer.softOfferMax,
        estimatedMonthlyMin: offer.estimatedMonthlyMin,
        estimatedMonthlyMax: offer.estimatedMonthlyMax,
      });
    }
    setStage("result");
  }

  function handleSendToVp() {
    setSendError(null);
    startSending(async () => {
      const res = await sendDealToVp(form);
      if (!res.ok) {
        setSendError(res.error ?? "Something went wrong. Please try again.");
        return;
      }
      setVpName(res.vpName ?? null);
      setSent(true);
    });
  }

  function handleStartNewDeal() {
    setForm(EMPTY_DEAL_FORM_STATE);
    setStage("form");
    setResult(null);
    setSendError(null);
    setSent(false);
    setVpName(null);
    lastRecordedReason.current = null;
  }

  if (stage === "result" && result) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <ResultScreen
          result={result}
          onSendToVp={handleSendToVp}
          sending={sending}
          sendError={sendError}
          sent={sent}
          vpName={vpName}
          onStartNewDeal={handleStartNewDeal}
          onBackToForm={() => setStage("form")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      {verdict.kind === "disqualified" && <WarningBanner variant="blocking" message={verdict.reason} />}
      {verdict.kind === "needs_vp_call_alaska" && (
        <WarningBanner variant="informational" message={verdict.reason} />
      )}

      {/* Rep info — always editable, not part of the disqualification lock chain */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Your Info</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Your Name" htmlFor="rep_name">
            <input
              id="rep_name"
              className={inputClass}
              value={form.rep_name}
              onChange={(e) => update("rep_name", e.target.value)}
              required
            />
          </Field>
          <Field label="Your Phone" htmlFor="rep_phone">
            <input
              id="rep_phone"
              type="tel"
              className={inputClass}
              value={form.rep_phone}
              onChange={(e) => update("rep_phone", e.target.value)}
              required
            />
          </Field>
          <Field label="Your Email" htmlFor="rep_email">
            <input
              id="rep_email"
              type="email"
              className={inputClass}
              value={form.rep_email}
              onChange={(e) => update("rep_email", e.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      {/* Fast-disqualification fields, per Section 8 positioned early */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Property</h2>
        <div className="space-y-4">
          <Field label="Property State" htmlFor="property_state">
            <select
              id="property_state"
              className={inputClass}
              value={form.property_state}
              disabled={locked("property_state")}
              onChange={(e) => update("property_state", e.target.value)}
            >
              <option value="">Select a state...</option>
              {STATE_OPTIONS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Property Type" htmlFor="property_type">
            <select
              id="property_type"
              className={inputClass}
              value={form.property_type}
              disabled={locked("property_type")}
              onChange={(e) => update("property_type", e.target.value as DealFormState["property_type"])}
            >
              <option value="">Select a type...</option>
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {form.property_type && (
            <fieldset disabled={locked("property_subtypes")}>
              <legend className={labelClass}>
                Does the property match any of these? (check all that apply)
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROPERTY_SUBTYPE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.property_subtypes.includes(o.value)}
                      onChange={() => toggleSubtype(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {form.property_subtypes.includes("assisted_living_facility") && (
                <label className="mt-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.assisted_living_converted_sfr}
                    onChange={(e) => update("assisted_living_converted_sfr", e.target.checked)}
                  />
                  This is a converted single-family residence (allowed exception)
                </label>
              )}
            </fieldset>
          )}

          <Field label="Current Value" htmlFor="current_value" hint="Minimum $100,000 (NY residential: $250,000)">
            <input
              id="current_value"
              type="number"
              min={0}
              step={1000}
              className={inputClass}
              value={form.current_value}
              disabled={locked("current_value")}
              onChange={(e) => update("current_value", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* Deal details */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Deal Details</h2>
        <div className="space-y-4">
          <Field label="Position Sought" htmlFor="position_sought">
            <select
              id="position_sought"
              className={inputClass}
              value={form.position_sought}
              disabled={locked("position_sought")}
              onChange={(e) => update("position_sought", e.target.value as DealFormState["position_sought"])}
            >
              <option value="">Select...</option>
              {POSITION_SOUGHT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {needsDebt && (
            <Field label="Current Debt Owed (all liens)" htmlFor="current_debt_owed">
              <input
                id="current_debt_owed"
                type="number"
                min={0}
                step={1000}
                className={inputClass}
                value={form.current_debt_owed}
                disabled={locked("current_debt_owed")}
                onChange={(e) => update("current_debt_owed", e.target.value)}
              />
            </Field>
          )}

          <div>
            <span className={labelClass}>
              Does the borrower own the property 100% themselves, or is there anyone else on title?
            </span>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="sole_owner"
                  disabled={locked("sole_owner")}
                  checked={form.sole_owner === "yes"}
                  onChange={() => update("sole_owner", "yes")}
                />
                Sole owner
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="sole_owner"
                  disabled={locked("sole_owner")}
                  checked={form.sole_owner === "no"}
                  onChange={() => update("sole_owner", "no")}
                />
                There&apos;s a co-owner
              </label>
            </div>
          </div>

          {form.sole_owner === "no" && (
            <>
              <WarningBanner
                variant="informational"
                message="An affidavit will be required from the co-owner(s) before closing — make sure to get their name and let the client know."
              />
              <Field label="Co-Owner Name(s)" htmlFor="co_owner_names">
                <input
                  id="co_owner_names"
                  className={inputClass}
                  disabled={locked("co_owner_names")}
                  value={form.co_owner_names}
                  onChange={(e) => update("co_owner_names", e.target.value)}
                />
              </Field>
            </>
          )}

          <Field label="Borrower Name" htmlFor="borrower_name">
            <input
              id="borrower_name"
              className={inputClass}
              disabled={locked("borrower_name")}
              value={form.borrower_name}
              onChange={(e) => update("borrower_name", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Property Address" htmlFor="property_address">
              <input
                id="property_address"
                className={inputClass}
                disabled={locked("property_address")}
                value={form.property_address}
                onChange={(e) => update("property_address", e.target.value)}
              />
            </Field>
            <Field label="City" htmlFor="property_city">
              <input
                id="property_city"
                className={inputClass}
                disabled={locked("property_city")}
                value={form.property_city}
                onChange={(e) => update("property_city", e.target.value)}
              />
            </Field>
            <Field label="Zip" htmlFor="property_zip">
              <input
                id="property_zip"
                className={inputClass}
                disabled={locked("property_zip")}
                value={form.property_zip}
                onChange={(e) => update("property_zip", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Exit Strategy" htmlFor="exit_strategy">
            <select
              id="exit_strategy"
              className={inputClass}
              disabled={locked("exit_strategy")}
              value={form.exit_strategy}
              onChange={(e) => update("exit_strategy", e.target.value as DealFormState["exit_strategy"])}
            >
              <option value="">Select...</option>
              {EXIT_STRATEGY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Use of Funds" htmlFor="use_of_funds">
            <textarea
              id="use_of_funds"
              rows={2}
              className={inputClass}
              disabled={locked("use_of_funds")}
              value={form.use_of_funds}
              onChange={(e) => update("use_of_funds", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <button
        onClick={handleCheckDeal}
        disabled={!canCheckDeal}
        className="w-full rounded-md bg-slate-900 px-4 py-3 font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
      >
        Check This Deal
      </button>
    </div>
  );
}
