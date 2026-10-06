// Lists open service orders, or moves one on:
//   npm run service-order
//   npm run service-order -- <orderId> in_progress|delivered|cancelled
import { db } from "@/db";
import { formatDate, todayInKenya } from "@/lib/dates";
import { createEmailSender } from "@/lib/email";
import { formatPaymentAmount, formatReceiptNumber } from "@/lib/billing";
import { openServiceOrders, setServiceOrderStatus } from "@/lib/service-orders";
import { SERVICE_ORDER_STATUSES, SERVICES, type ServiceKey, type ServiceOrderStatus } from "@/lib/services";

const [orderId, status] = process.argv.slice(2);
const MOVES: ServiceOrderStatus[] = ["in_progress", "delivered", "cancelled"];

if (!orderId) {
  const open = await openServiceOrders(db);
  if (open.length === 0) console.log("No open service orders.");
  for (const { order, payment } of open) {
    console.log(
      [
        order.id,
        SERVICE_ORDER_STATUSES[order.status as ServiceOrderStatus],
        SERVICES[payment.service as ServiceKey].name,
        payment.billedName,
        `${formatPaymentAmount(payment)} (${formatReceiptNumber(payment.receiptNumber!)}, paid ${formatDate(todayInKenya(payment.paidAt!))})`,
      ].join("  "),
    );
  }
  process.exit(0);
}

if (!MOVES.includes(status as ServiceOrderStatus)) {
  console.error(`Usage: npm run service-order -- <orderId> ${MOVES.join("|")}`);
  process.exit(2);
}

const result = await setServiceOrderStatus(db, createEmailSender(), orderId, status as ServiceOrderStatus);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log(`Order ${orderId} is now "${SERVICE_ORDER_STATUSES[status as ServiceOrderStatus]}".`);
if (result.emailed.length > 0) console.log(`Emailed ${result.emailed.join(", ")}.`);
if (status === "cancelled") console.log("If they paid, refund them from the Paystack dashboard.");
process.exit(0);
