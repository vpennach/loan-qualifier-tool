import "server-only";
import { Resend } from "resend";
import type { DealFormState, ResultStatus } from "@/lib/types";

export interface VpNotificationPayload {
  shopName: string;
  form: DealFormState;
  resultStatus: ResultStatus;
  disqualificationReason: string | null;
  softOfferMin: number | null;
  softOfferMax: number | null;
  estimatedMonthlyMin: number | null;
  estimatedMonthlyMax: number | null;
}

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function offerOrReasonHtml(p: VpNotificationPayload): string {
  if (p.resultStatus === "needs_vp_call") {
    return `<p><strong>Status:</strong> Needs VP Call</p><p>${p.disqualificationReason ?? "This deal needs a direct call with the VP before quoting a number."}</p>`;
  }
  if (p.resultStatus === "soft_offer_generated" && p.softOfferMin !== null && p.softOfferMax !== null) {
    return `
      <p><strong>Soft Offer Range:</strong> ${currency(p.softOfferMin)} – ${currency(p.softOfferMax)}</p>
      <p><strong>Estimated Monthly Payment:</strong> ${currency(p.estimatedMonthlyMin ?? 0)} – ${currency(p.estimatedMonthlyMax ?? 0)}</p>
    `;
  }
  return "";
}

function buildEmailHtml(p: VpNotificationPayload): string {
  const f = p.form;
  return `
    <h2>New Deal Submission — ${p.shopName}</h2>
    <h3>Rep</h3>
    <p>${f.rep_name} — ${f.rep_phone} — ${f.rep_email}</p>

    <h3>Borrower / Property</h3>
    <p><strong>Borrower:</strong> ${f.borrower_name || "—"} — ${f.borrower_phone || "—"} — ${f.borrower_email || "—"}</p>
    <p><strong>Address:</strong> ${f.property_address || "—"}, ${f.property_city || "—"}, ${f.property_state || "—"} ${f.property_zip || "—"}</p>
    <p><strong>Property Type:</strong> ${f.property_type || "—"}</p>
    <p><strong>Position Sought:</strong> ${f.position_sought || "—"}</p>
    <p><strong>Current Value:</strong> ${f.current_value ? currency(Number(f.current_value)) : "—"}</p>
    <p><strong>Current Debt Owed:</strong> ${f.current_debt_owed ? currency(Number(f.current_debt_owed)) : "—"}</p>
    <p><strong>Exit Strategy:</strong> ${f.exit_strategy || "—"}</p>
    <p><strong>Use of Funds:</strong> ${f.use_of_funds || "—"}</p>
    <p><strong>Sole Owner:</strong> ${f.sole_owner === "yes" ? "Yes" : f.sole_owner === "no" ? `No — co-owner(s): ${f.co_owner_names}` : "—"}</p>

    <h3>Result</h3>
    ${offerOrReasonHtml(p)}
  `;
}

export async function sendVpNotificationEmail(payload: VpNotificationPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const vpEmail = process.env.VP_EMAIL;
  const vpName = process.env.VP_NAME || "the VP";
  const fromAddress = process.env.RESEND_FROM_EMAIL || "Loan Qualifier Tool <onboarding@resend.dev>";

  if (!apiKey || !vpEmail) {
    throw new Error(
      "Missing RESEND_API_KEY or VP_EMAIL. Copy .env.local.example to .env.local and fill these in."
    );
  }

  const resend = new Resend(apiKey);
  const borrowerLabel = payload.form.borrower_name || "Unnamed Borrower";

  await resend.emails.send({
    from: fromAddress,
    to: vpEmail,
    subject: `New Deal Submission — ${payload.shopName} (${borrowerLabel})`,
    html: buildEmailHtml(payload),
  });

  return { vpName };
}
