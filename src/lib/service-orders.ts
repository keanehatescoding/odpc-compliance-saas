import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, payments, serviceOrders, users } from "@/db/schema";
import { formatPaymentAmount, formatReceiptNumber, sellerFromEnv, type Seller } from "./billing";
import type { SendEmail } from "./email";
import { ownerEmails } from "./reminders";
import { SERVICES, SERVICE_ORDER_STATUSES, type ServiceKey, type ServiceOrderStatus } from "./services";
import { isUuid } from "./uuid";

/** Orders paid for and not yet delivered or cancelled, oldest first: the work queue. */
export async function openServiceOrders(db: Db) {
  return db
    .select({ order: serviceOrders, payment: payments })
    .from(serviceOrders)
    .innerJoin(payments, eq(payments.id, serviceOrders.paymentId))
    .where(inArray(serviceOrders.status, ["paid", "in_progress"]))
    .orderBy(asc(payments.paidAt));
}

/** An organisation's paid orders, newest first, with what each cost. Unpaid checkouts are left out. */
export async function serviceOrdersFor(db: Db, orgId: string) {
  return db
    .select({ order: serviceOrders, payment: payments })
    .from(serviceOrders)
    .innerJoin(payments, eq(payments.id, serviceOrders.paymentId))
    .where(and(eq(serviceOrders.orgId, orgId), ne(serviceOrders.status, "awaiting_payment")))
    .orderBy(desc(payments.paidAt));
}

export function serviceOrderNotice(
  to: string,
  o: { orgName: string; service: ServiceKey; notes: string | null; amount: string; receipt: string; orderId: string },
  requester: { name: string; email: string } | null,
) {
  return {
    to: [to],
    subject: `New order: ${SERVICES[o.service].name} for ${o.orgName}`,
    text: [
      `${o.orgName} has paid ${o.amount} for a ${SERVICES[o.service].noun} (receipt ${o.receipt}).`,
      "",
      `Ordered by: ${requester ? `${requester.name} <${requester.email}>` : "an account that has since been deleted"}`,
      `Order ID: ${o.orderId}`,
      "",
      "What they want covered:",
      "",
      o.notes?.trim() || "(nothing given)",
      "",
      `When you start, mark it in progress at ${process.env.APP_URL ?? "http://localhost:3000"}/staff/orders, or run:`,
      `npm run service-order -- ${o.orderId} in_progress`,
    ].join("\n"),
  };
}

/**
 * Tells Kinga (SELLER_EMAIL) about a service order just paid for. Call it only
 * after recordPayment returns "credited" for a service payment, so each order
 * is announced once. A failed send is logged rather than thrown: the order is
 * in the database either way.
 */
export async function sendServiceOrderNotice(
  db: Db,
  sendEmail: SendEmail,
  paymentId: string,
  seller: Seller = sellerFromEnv(),
): Promise<void> {
  if (!seller.email) {
    console.error("SELLER_EMAIL isn't set, so nobody was told about the service order for payment", paymentId);
    return;
  }
  try {
    const [row] = await db
      .select({ order: serviceOrders, payment: payments, requester: { name: users.name, email: users.email } })
      .from(serviceOrders)
      .innerJoin(payments, eq(payments.id, serviceOrders.paymentId))
      .leftJoin(users, eq(users.id, serviceOrders.requestedBy))
      .where(eq(serviceOrders.paymentId, paymentId))
      .limit(1);
    if (!row || row.payment.receiptNumber === null) return;
    await sendEmail(
      serviceOrderNotice(
        seller.email,
        {
          orgName: row.payment.billedName ?? "",
          service: row.payment.service as ServiceKey,
          notes: row.order.notes,
          amount: formatPaymentAmount(row.payment),
          receipt: formatReceiptNumber(row.payment.receiptNumber),
          orderId: row.order.id,
        },
        row.requester?.email ? { name: row.requester.name, email: row.requester.email } : null,
      ),
    );
  } catch (err) {
    console.error("Failed to send service order notice", paymentId, err);
  }
}

/** Which statuses an order can move to from each status. */
const NEXT_STATUSES: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  awaiting_payment: [],
  paid: ["in_progress", "delivered", "cancelled"],
  in_progress: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type SetStatusResult =
  /** `emailError` is set when the status changed but the delivery email couldn't be sent. */
  | { ok: true; emailed: string[]; emailError?: string }
  | { ok: false; error: string };

/**
 * Moves an order on, for Kinga staff (from /staff/orders or scripts/service-order.ts). Owners
 * are emailed when it's delivered. The status is saved first, so a failed
 * email is returned rather than thrown: the order can't be delivered twice to
 * retry it. Refunding a cancelled order is done in the Paystack dashboard.
 */
export async function setServiceOrderStatus(
  db: Db,
  sendEmail: SendEmail,
  orderId: string,
  status: ServiceOrderStatus,
  opts: { now?: Date; appUrl?: string } = {},
): Promise<SetStatusResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  if (!isUuid(orderId)) return { ok: false, error: "No order has that ID." };
  type Moved = { error: string } | { orgId: string; orgName: string; service: ServiceKey };
  const moved = await db.transaction(async (tx): Promise<Moved> => {
    const [order] = await tx.select().from(serviceOrders).where(eq(serviceOrders.id, orderId)).for("update");
    if (!order) return { error: "No order has that ID." };
    const current = order.status as ServiceOrderStatus;
    if (!NEXT_STATUSES[current].includes(status)) {
      return { error: `An order that is "${SERVICE_ORDER_STATUSES[current]}" can't become "${SERVICE_ORDER_STATUSES[status]}".` };
    }
    await tx
      .update(serviceOrders)
      .set({ status, deliveredAt: status === "delivered" ? now : null })
      .where(eq(serviceOrders.id, orderId));
    const [row] = await tx
      .select({ orgName: organizations.name, service: payments.service })
      .from(payments)
      .innerJoin(organizations, eq(organizations.id, payments.orgId))
      .where(eq(payments.id, order.paymentId));
    return { orgId: order.orgId, orgName: row.orgName, service: row.service as ServiceKey };
  });
  if ("error" in moved) return { ok: false, error: moved.error };
  if (status !== "delivered") return { ok: true, emailed: [] };

  const to = await ownerEmails(db, moved.orgId);
  if (to.length === 0) return { ok: true, emailed: [] };
  try {
    await sendEmail(serviceDeliveredEmail(to, moved.orgName, moved.service, `${appUrl}/services`));
  } catch (err) {
    console.error("Failed to send service delivered email", orderId, err);
    return { ok: true, emailed: [], emailError: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, emailed: to };
}

export function serviceDeliveredEmail(to: string[], orgName: string, service: ServiceKey, link: string) {
  const noun = SERVICES[service].noun;
  return {
    to,
    subject: `${orgName}: your ${noun} is complete`,
    text: [
      "Hello,",
      "",
      `We've finished ${orgName}'s ${noun}. We've sent the results to the person who ordered it.`,
      "",
      "Your orders are listed here:",
      "",
      link,
      "",
      "Reply to this email if you have any questions about it.",
    ].join("\n"),
  };
}
