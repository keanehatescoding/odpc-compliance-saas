import type { Metadata } from "next";
import Link from "next/link";
import { moveServiceOrder } from "@/app/actions/staff";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { db } from "@/db";
import { formatPaymentAmount, formatReceiptNumber } from "@/lib/billing";
import { daysBetween, formatDate, todayInKenya } from "@/lib/dates";
import { SERVICE_ORDER_STATUSES, SERVICES, type ServiceKey, type ServiceOrderStatus } from "@/lib/services";
import { requireStaff } from "@/lib/session";
import { staffServiceOrders } from "@/lib/staff";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Service orders" };

export default async function StaffOrdersPage() {
  await requireStaff();
  const orders = await staffServiceOrders(db);
  const today = todayInKenya();

  return (
    <>
      <PageHeader
        title="Service orders"
        description="Paid orders not yet delivered or cancelled, oldest first. Marking one delivered emails the organisation's owners."
      />
      {orders.length === 0 ? (
        <EmptyState title="No open orders." />
      ) : (
        <div className="space-y-4">
          {orders.map(({ order, payment, org, requester }) => {
            const service = SERVICES[payment.service as ServiceKey];
            const paidOn = todayInKenya(payment.paidAt!);
            const waiting = daysBetween(paidOn, today);
            return (
              <Card key={order.id} className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{service.name}</h2>
                    <Pill tone="amber">{SERVICE_ORDER_STATUSES[order.status as ServiceOrderStatus]}</Pill>
                  </div>
                  <p className="mt-1 text-sm">
                    <Link href={`/staff/organisations/${org.id}`} className="font-medium hover:underline">
                      {org.name}
                    </Link>
                    {org.deletedAt && <span className="text-stone-500"> (deleted)</span>}
                    {requester ? (
                      <span className="text-stone-600">
                        {" "}
                        · ordered by {requester.name} &lt;{requester.email}&gt;
                      </span>
                    ) : (
                      <span className="text-stone-600"> · ordered by an account since deleted</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatPaymentAmount(payment)}, {formatReceiptNumber(payment.receiptNumber!)}, paid {formatDate(paidOn)} (
                    {waiting} {waiting === 1 ? "day" : "days"} ago; turnaround {service.turnaround})
                  </p>
                  <div className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-sm whitespace-pre-wrap text-stone-800">
                    {order.notes?.trim() || <span className="text-stone-500">They didn&apos;t say what they want covered.</span>}
                  </div>
                </div>
                <OrderActions action={moveServiceOrder.bind(null, order.id)} started={order.status === "in_progress"} />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
