"use client";

export type DealResult =
  | { status: "needs_vp_call"; reason: string }
  | {
      status: "soft_offer_generated";
      softOfferMin: number;
      softOfferMax: number;
      estimatedMonthlyMin: number;
      estimatedMonthlyMax: number;
    };

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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
