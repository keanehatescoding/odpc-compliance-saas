import type { Metadata } from "next";
import Link from "next/link";
import { Card, FormMessage, PageHeader, Pill } from "@/components/ui";
import { db } from "@/db";
import { lastFailedRenewal, savedCardFor } from "@/lib/auto-renew";
import { formatPaymentAmount, formatReceiptNumber, paymentHistory, paymentMethod } from "@/lib/billing";
import { formatDate, formatDateTime, todayInKenya } from "@/lib/dates";
import { formatKsh, ORG_SIZES, type OrgSize } from "@/lib/dpa";
import { paystackFromEnv } from "@/lib/paystack";
import {
  accessFor,
  BILLING_INTERVALS,
  cardExpiry,
  cardLabel,
  nextRenewalAttemptAt,
  PLAN_PRICES,
  willAutoRenew,
  type BillingInterval,
} from "@/lib/plans";
import { SERVICES, type ServiceKey } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";
import { PayForm } from "./pay-form";
import { RenewalForm } from "./renewal-form";

export const metadata: Metadata = { title: "Billing" };

// Set by the return from Paystack checkout (see ./callback/route.ts).
const PAYMENT_NOTICES = {
  paid: { message: "Payment received. Thank you!", tone: "success" },
  unpaid: { message: "The payment didn't go through, so you haven't been charged. You can try again below.", tone: "error" },
  checking: {
    message:
      "We're waiting for Paystack to confirm your payment. If you approved it, refresh this page in a minute, and don't pay again meanwhile. If it hasn't shown up after 10 minutes, try again below.",
    tone: "success",
  },
  problem: { message: "Something went wrong confirming your payment. Contact us and we'll sort it out.", tone: "error" },
} as const;

const day = (d: Date) => formatDate(todayInKenya(d));

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { org, role } = await requireOrgContext();
  const { payment, lapsed } = await searchParams;
  const access = accessFor(org);
  const prices = PLAN_PRICES[org.size as OrgSize];
  const history = await paymentHistory(db, org.id);
  const card = await savedCardFor(db, org.id);
  const renewing = willAutoRenew(org, card, access.endsAt);
  const failedRenewal = renewing ? await lastFailedRenewal(db, org.id, access.endsAt) : null;
  const nextTry = failedRenewal ? nextRenewalAttemptAt(access.endsAt, failedRenewal.attempt) : null;
  const canPay = role !== "member";
  const paymentsReady = paystackFromEnv() !== null;
  const notice = typeof payment === "string" && payment in PAYMENT_NOTICES ? PAYMENT_NOTICES[payment as keyof typeof PAYMENT_NOTICES] : null;

  return (
    <>
      <PageHeader title="Billing" description={`${org.name}'s Kinga subscription, priced by organisation size.`} />
      <div className="space-y-6">
        {notice && <FormMessage message={notice.message} tone={notice.tone} />}
        {lapsed && access.state === "lapsed" && (
          <FormMessage message="That change wasn't saved because your subscription has lapsed. Pay below to keep editing your records." />
        )}

        <Card>
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            {access.state === "trial" && "Free trial"}
            {access.state === "active" && "Subscribed"}
            {access.state === "lapsed" && "Subscription lapsed"}
            {access.state !== "lapsed" && access.daysLeft <= 7 && (
              <Pill tone="amber">
                {access.daysLeft} {access.daysLeft === 1 ? "day" : "days"} left
              </Pill>
            )}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {access.state === "trial" && `Your free trial ends on ${day(access.endsAt)}.`}
            {access.state === "active" &&
              `Paid up to ${day(access.endsAt)}.${renewing ? ` Renews automatically on ${day(access.endsAt)}.` : ""}`}
            {access.state === "lapsed" &&
              `Your ${org.paidUntil ? "subscription" : "free trial"} ended on ${day(access.endsAt)}. Kinga is read-only until you pay: you can still see, print and export all your records, log and manage data breaches, and manage the team and settings. Renewal reminders and deadline alerts keep coming.`}
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold">Your plan</h2>
          <p className="mt-1 text-sm text-stone-600">
            {ORG_SIZES[org.size as OrgSize]}: {formatKsh(prices.month)} a month, or {formatKsh(prices.year)} a year (two
            months free). The price follows the organisation size in Settings.
          </p>
          {canPay ? (
            paymentsReady ? (
              <>
                <PayForm prices={prices} renewing={card !== null} />
                <p className="mt-3 text-xs text-stone-500">
                  Pay by M-Pesa or card through Paystack. Each payment adds a month or a year after your current
                  {access.state === "trial" ? " trial" : " period"} ends, so paying early doesn&apos;t lose any days. Unless a
                  card is saved for automatic renewal, we&apos;ll email owners 3 days before it ends.
                </p>
                {!org.kraPin && (
                  <p className="mt-2 text-xs text-stone-500">
                    To have your KRA PIN on receipts, add it in{" "}
                    <Link href="/settings" className="underline">
                      Settings
                    </Link>{" "}
                    before you pay.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-stone-700">Online payment isn&apos;t set up yet. Contact us to pay by invoice.</p>
            )
          ) : (
            <p className="mt-4 text-sm text-stone-700">Ask an owner or admin to pay.</p>
          )}
        </Card>

        {card && (
          <Card>
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              Automatic renewal
              {renewing ? <Pill>On</Pill> : <Pill tone="amber">Off</Pill>}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Saved card: {cardLabel(card)}
              {cardExpiry(card) && `, expires ${cardExpiry(card)}`}.{" "}
              {renewing
                ? `We'll charge ${formatKsh(PLAN_PRICES[org.size as OrgSize][org.autoRenewInterval])} for another ${org.autoRenewInterval} up to a day before ${day(access.endsAt)}, and email a receipt. If the charge fails we try again 1 and 3 days after.`
                : org.autoRenewInterval
                  ? `The card expires before ${day(access.endsAt)}, so it won't be charged. Pay with another card and tick “Save my card” to keep renewing automatically.`
                  : "It won't be charged unless you turn automatic renewal on."}
            </p>
            {failedRenewal && (
              <div className="mt-3">
                <FormMessage
                  message={`The last charge, on ${day(failedRenewal.at)}, didn't go through: ${failedRenewal.error}.${nextTry ? ` We'll try again on ${day(nextTry)}.` : ""}`}
                />
              </div>
            )}
            {canPay && <RenewalForm current={(org.autoRenewInterval as BillingInterval | null) ?? "off"} />}
          </Card>
        )}

        {history.length > 0 && (
          <Card className="p-0">
            <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">Payments</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Paid</th>
                    <th className="px-5 py-2 font-medium">For</th>
                    <th className="px-5 py-2 font-medium">Amount</th>
                    <th className="px-5 py-2 font-medium">Covers</th>
                    <th className="px-5 py-2 font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {history.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(p.paidAt)}</td>
                      <td className="px-5 py-3">
                        {p.kind === "service"
                          ? SERVICES[p.service as ServiceKey].name
                          : `${BILLING_INTERVALS[p.interval as BillingInterval]} plan`}{" "}
                        · {paymentMethod(p.channel)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {formatPaymentAmount(p)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {p.periodStart && p.periodEnd ? `${day(p.periodStart)} – ${day(p.periodEnd)}` : "—"}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {p.receiptNumber !== null && (
                          <Link href={`/billing/receipts/${p.id}`} className="font-medium hover:underline">
                            {formatReceiptNumber(p.receiptNumber)}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
