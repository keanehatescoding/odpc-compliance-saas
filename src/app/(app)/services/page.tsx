import type { Metadata } from "next";
import Link from "next/link";
import { Card, FormMessage, PageHeader, Pill } from "@/components/ui";
import { db } from "@/db";
import { formatPaymentAmount, formatReceiptNumber } from "@/lib/billing";
import { formatDate, todayInKenya } from "@/lib/dates";
import { formatKsh, ORG_SIZES, type OrgSize } from "@/lib/dpa";
import { paystackFromEnv } from "@/lib/paystack";
import { serviceOrdersFor } from "@/lib/service-orders";
import { SERVICE_KEYS, SERVICE_ORDER_STATUSES, SERVICES, type ServiceKey, type ServiceOrderStatus } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Expert services" };

// Set by the return from Paystack checkout (see ../billing/callback/route.ts).
const PAYMENT_NOTICES = {
  paid: { message: "Payment received, thank you. We'll be in touch to get started.", tone: "success" },
  unpaid: { message: "The payment didn't go through, so you haven't been charged. You can try again below.", tone: "error" },
  checking: {
    message:
      "We're waiting for Paystack to confirm your payment. If you approved it, refresh this page in a minute, and don't pay again meanwhile.",
    tone: "success",
  },
  problem: { message: "Something went wrong confirming your payment. Contact us and we'll sort it out.", tone: "error" },
} as const;

const STATUS_TONE: Record<ServiceOrderStatus, "stone" | "amber" | "red"> = {
  awaiting_payment: "stone",
  paid: "amber",
  in_progress: "amber",
  delivered: "stone",
  cancelled: "red",
};

export default async function ServicesPage({ searchParams }: PageProps<"/services">) {
  const { org, role } = await requireOrgContext();
  const { payment, service } = await searchParams;
  const size = org.size as OrgSize;
  const orders = await serviceOrdersFor(db, org.id);
  const canOrder = role !== "member";
  const paymentsReady = paystackFromEnv() !== null;
  const notice = typeof payment === "string" && payment in PAYMENT_NOTICES ? PAYMENT_NOTICES[payment as keyof typeof PAYMENT_NOTICES] : null;
  const options = Object.fromEntries(
    SERVICE_KEYS.map((k) => [k, `${SERVICES[k].name}: ${formatKsh(SERVICES[k].prices[size])}`]),
  );
  const preselected = typeof service === "string" && service in SERVICES ? service : undefined;

  return (
    <>
      <PageHeader
        title="Expert services"
        description="One-off help from a data protection specialist, paid once and separate from your subscription."
      />
      <div className="space-y-6">
        {notice && <FormMessage message={notice.message} tone={notice.tone} />}

        <div className="grid gap-4 md:grid-cols-2">
          {SERVICE_KEYS.map((key) => {
            const s = SERVICES[key];
            return (
              <Card key={key} className="flex flex-col">
                <h2 className="font-semibold">{s.name}</h2>
                <p className="mt-1 text-2xl font-semibold">{formatKsh(s.prices[size])}</p>
                <p className="text-xs text-stone-500">{ORG_SIZES[size]} organisations · {s.turnaround}</p>
                <p className="mt-3 text-sm text-stone-700">{s.description}</p>
                <p className="mt-2 text-sm text-stone-700">
                  <span className="font-medium">You get: </span>
                  {s.deliverable}
                </p>
                {canOrder && paymentsReady && (
                  <Link href={`/services?service=${key}#order`} className="mt-4 text-sm font-medium text-brand-700 hover:underline">
                    Order this
                  </Link>
                )}
              </Card>
            );
          })}
        </div>

        <Card id="order">
          <h2 className="font-semibold">Order a service</h2>
          {canOrder ? (
            paymentsReady ? (
              <div className="mt-4 max-w-xl">
                <OrderForm key={preselected} options={options} initial={preselected} />
                <p className="mt-3 text-xs text-stone-500">
                  Pay by M-Pesa or card through Paystack. The turnaround starts once we&apos;ve agreed the details with you.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-stone-700">Online payment isn&apos;t set up yet. Contact us to order by invoice.</p>
            )
          ) : (
            <p className="mt-2 text-sm text-stone-700">Ask an owner or admin to order a service.</p>
          )}
        </Card>

        {orders.length > 0 && (
          <Card className="p-0">
            <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">Your orders</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Ordered</th>
                    <th className="px-5 py-2 font-medium">Service</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Amount</th>
                    <th className="px-5 py-2 font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {orders.map(({ order, payment: p }) => {
                    const status = order.status as ServiceOrderStatus;
                    return (
                      <tr key={order.id}>
                        <td className="px-5 py-3 whitespace-nowrap">{p.paidAt && formatDate(todayInKenya(p.paidAt))}</td>
                        <td className="px-5 py-3">
                          {SERVICES[p.service as ServiceKey].name}
                          {order.notes && <span className="block max-w-md truncate text-xs text-stone-500">{order.notes}</span>}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Pill tone={STATUS_TONE[status]}>{SERVICE_ORDER_STATUSES[status]}</Pill>
                          {order.deliveredAt && (
                            <span className="block text-xs text-stone-500">{formatDate(todayInKenya(order.deliveredAt))}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">{formatPaymentAmount(p)}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          {p.receiptNumber !== null && (
                            <Link href={`/billing/receipts/${p.id}`} className="font-medium hover:underline">
                              {formatReceiptNumber(p.receiptNumber)}
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
