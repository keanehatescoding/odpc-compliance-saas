import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
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
import { etimsConfigFromEnv, etimsVerifyUrl, formatCuInvoiceNumber } from "@/lib/etims";
import { etimsInvoiceFor } from "@/lib/etims-invoices";
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
  const invoice = await etimsInvoiceFor(db, payment.id);
  const config = etimsConfigFromEnv();
  const signed = invoice?.status === "signed" && invoice.tin && invoice.bhfId && invoice.rcptSign ? invoice : null;
  const verifyUrl = signed && config ? etimsVerifyUrl(config, signed.tin!, signed.bhfId!, signed.rcptSign!) : null;
  const qr = verifyUrl ? await QRCode.toString(verifyUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;

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

        {signed ? (
          <section className="mt-8 flex flex-wrap items-start gap-6 border-t border-stone-300 pt-4">
            <div className="grow">
              <h2 className="mb-2 font-semibold">KRA eTIMS invoice</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                <dt className="text-stone-600">CU invoice number</dt>
                <dd className="font-mono text-xs leading-5">{formatCuInvoiceNumber(signed)}</dd>
                {signed.sdcDateTime && (
                  <>
                    <dt className="text-stone-600">CU date and time</dt>
                    <dd>
                      {formatDate(todayInKenya(signed.sdcDateTime))}{" "}
                      {signed.sdcDateTime.toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </dd>
                  </>
                )}
                <dt className="text-stone-600">Internal data</dt>
                <dd className="font-mono text-xs leading-5 break-all">{signed.intrlData}</dd>
                <dt className="text-stone-600">Receipt signature</dt>
                <dd className="font-mono text-xs leading-5 break-all">{signed.rcptSign}</dd>
              </dl>
            </div>
            {qr && verifyUrl && (
              <a href={verifyUrl} className="block size-28 shrink-0" aria-label="Check this invoice with KRA">
                <span dangerouslySetInnerHTML={{ __html: qr }} className="block size-full [&>svg]:size-full" />
              </a>
            )}
          </section>
        ) : (
          invoice && (
            <p className="mt-8 border-t border-stone-300 pt-4 text-stone-600">
              KRA eTIMS invoice pending. It will show here once KRA has signed it.
            </p>
          )
        )}

        <p className="mt-8 text-stone-600">Thank you for your payment.</p>
      </article>
    </div>
  );
}
