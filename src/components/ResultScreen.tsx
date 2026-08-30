"use client";

import type { SoftOfferBreakdown } from "@/lib/soft-offer";

export type DealResult =
  | { status: "needs_vp_call"; reason: string }
  | {
      status: "soft_offer_generated";
      softOfferMin: number;
      softOfferMax: number;
      estimatedMonthlyMin: number;
      estimatedMonthlyMax: number;
      breakdown: SoftOfferBreakdown;
    };

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = (n: number) => `${Math.round(n * 100)}%`;

function MathRow({ label, formula }: { label: string; formula: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="font-mono text-sm text-slate-800">{formula}</span>
    </div>
  );
}

function CalculationBreakdown({
  breakdown,
  softOfferMin,
  softOfferMax,
}: {
  breakdown: SoftOfferBreakdown;
  softOfferMin: number;
  softOfferMax: number;
}) {
  const b = breakdown;
  const isSecondPosition = b.equityInCollateral !== null;

  return (
    <details className="mt-6 text-left">
      <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
        Show the math
      </summary>
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
        <MathRow label="Property value" formula={currency(b.currentValue)} />
        <MathRow
          label={`LTV band (${b.ltvBandLabel})`}
          formula={`${percent(b.ltvLow)} – ${percent(b.ltvHigh)}`}
        />

        {isSecondPosition ? (
          <>
            <MathRow label="Current debt owed" formula={currency(b.currentDebtOwed ?? 0)} />
            <MathRow
              label="Equity in collateral"
              formula={`(${currency(b.currentValue)} × ${percent(b.ltvLow)}) − ${currency(
                b.currentDebtOwed ?? 0
              )} = ${currency(b.equityInCollateral ?? 0)}`}
            />
            <MathRow
              label="Loan amount (cushion on equity)"
              formula={`${currency(b.equityInCollateral ?? 0)} × ${percent(b.cushionLow ?? 0)} = ${currency(
                softOfferMin
              )}`}
            />
            <MathRow
              label=" "
              formula={`${currency(b.equityInCollateral ?? 0)} × ${percent(b.cushionHigh ?? 0)} = ${currency(
                softOfferMax
              )}`}
            />
          </>
        ) : (
          <>
            <MathRow
              label="Loan amount"
              formula={`${currency(b.currentValue)} × ${percent(b.ltvLow)} = ${currency(softOfferMin)}`}
            />
            <MathRow
              label=" "
              formula={`${currency(b.currentValue)} × ${percent(b.ltvHigh)} = ${currency(softOfferMax)}`}
            />
          </>
        )}

        <MathRow
          label={`Factor rate (${b.factorRateLabel})`}
          formula={`${b.factorRateLow} – ${b.factorRateHigh}`}
        />
        <MathRow
          label="Total payback"
          formula={`${currency(softOfferMin)} × ${b.factorRateLow} = ${currency(b.totalPaybackLow)}`}
        />
        <MathRow
          label=" "
          formula={`${currency(softOfferMax)} × ${b.factorRateHigh} = ${currency(b.totalPaybackHigh)}`}
        />
        <MathRow
          label={`Monthly payment (${b.amortizationMonths} mo)`}
          formula={`${currency(b.totalPaybackLow)} ÷ ${b.amortizationMonths} = ${currency(b.totalPaybackLow / b.amortizationMonths)}`}
        />
        <MathRow
          label=" "
          formula={`${currency(b.totalPaybackHigh)} ÷ ${b.amortizationMonths} = ${currency(b.totalPaybackHigh / b.amortizationMonths)}`}
        />
      </div>
    </details>
  );
}

export function ResultScreen({
  result,
  onSendToVp,
  sending,
  sendError,
  sent,
  vpName,
  onStartNewDeal,
  onBackToForm,
}: {
  result: DealResult;
  onSendToVp: () => void;
  sending: boolean;
  sendError: string | null;
  sent: boolean;
  vpName: string | null;
  onStartNewDeal: () => void;
  onBackToForm: () => void;
}) {
  if (sent) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-green-900">Sent to {vpName ?? "the VP"}</h2>
        <p className="mt-2 text-sm text-green-800">
          They&apos;ll follow up with an official pre-qualifying offer.
        </p>
        <button
          onClick={onStartNewDeal}
          className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-white shadow-sm hover:bg-slate-800"
        >
          Start a New Deal
        </button>
      </div>
    );
  }

  if (result.status === "needs_vp_call") {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">This deal needs a VP call</h2>
        <p className="mt-2 text-sm text-slate-600">{result.reason}</p>

        {sendError && <p className="mt-4 text-sm font-medium text-red-600">{sendError}</p>}

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onBackToForm}
            className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
          >
            Back
          </button>
          <button
            onClick={onSendToVp}
            disabled={sending}
            className="rounded-md bg-slate-900 px-4 py-2 text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send to VP"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-green-200 bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Deal Qualifies</p>
      <h2 className="mt-2 text-3xl font-bold text-slate-900">
        {currency(result.softOfferMin)} – {currency(result.softOfferMax)}
      </h2>
      <p className="text-sm text-slate-500">Estimated loan amount range</p>

      <div className="mt-6 rounded-md bg-slate-50 py-4">
        <p className="text-2xl font-semibold text-slate-900">
          {currency(result.estimatedMonthlyMin)} – {currency(result.estimatedMonthlyMax)}
          <span className="text-base font-normal text-slate-500"> / month</span>
        </p>
        <p className="text-sm text-slate-500">Estimated monthly payment</p>
      </div>

      <CalculationBreakdown
        breakdown={result.breakdown}
        softOfferMin={result.softOfferMin}
        softOfferMax={result.softOfferMax}
      />

      {sendError && <p className="mt-4 text-sm font-medium text-red-600">{sendError}</p>}

      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={onBackToForm}
          className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
        >
          Back
        </button>
        <button
          onClick={onSendToVp}
          disabled={sending}
          className="rounded-md bg-slate-900 px-4 py-2 text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send to VP"}
        </button>
      </div>
    </div>
  );
}
