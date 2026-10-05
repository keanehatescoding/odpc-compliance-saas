import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { BackLink } from "@/components/ui";
import { db } from "@/db";
import {
  formatPaymentAmount,
  formatReceiptNumber,
  getReceipt,
  paymentMethod,
  receiptDescription,
  sellerFromEnv,
} from "@/lib/billing";
import { formatDate, todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: PageProps<"/billing/receipts/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const payment = isUuid(id) ? await getReceipt(db, org.id, id) : null;
  if (!payment || payment.receiptNumber === null || !payment.paidAt) notFound();
  const seller = sellerFromEnv();
  const amount = formatPaymentAmount(payment);

  return (
    <div className="bg-white p-8 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <BackLink href="/billing">Back to billing</BackLink>
        <PrintButton />
      </div>

      <article className="max-w-2xl text-sm">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-stone-300 pb-4">
          <div>
            <h1 className="text-2xl font-semibold">Receipt</h1>
            <p className="mt-1 text-stone-600">{formatReceiptNumber(payment.receiptNumber)}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{seller.name}</p>
            {seller.address && <p className="whitespace-pre-line text-stone-600">{seller.address}</p>}
            {seller.kraPin && <p className="text-stone-600">KRA PIN {seller.kraPin}</p>}
            {seller.email && <p className="text-stone-600">{seller.email}</p>}
          </div>
        </header>

        <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-stone-600">Received from</dt>
          <dd>
            <span className="font-medium">{payment.billedName}</span>
            {payment.billedKraPin && <span className="block text-stone-600">KRA PIN {payment.billedKraPin}</span>}
          </dd>
          <dt className="text-stone-600">Date paid</dt>
          <dd>{formatDate(todayInKenya(payment.paidAt))}</dd>
          <dt className="text-stone-600">Paid by</dt>
          <dd>{paymentMethod(payment.channel)} through Paystack</dd>
          <dt className="text-stone-600">Reference</dt>
          <dd className="font-mono text-xs leading-5">{payment.reference}</dd>
        </dl>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-stone-300 text-xs text-stone-600 uppercase">
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-stone-200">
              <td className="py-3 pr-3">{receiptDescription(payment)}</td>
              <td className="py-3 text-right whitespace-nowrap">{amount}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 pr-3 text-right font-semibold">Total paid</td>
              <td className="py-3 text-right font-semibold whitespace-nowrap">{amount}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-8 text-stone-600">Thank you for your payment.</p>
      </article>
    </div>
  );
}
