"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { createEmailSender } from "@/lib/email";
import type { FormState } from "@/lib/forms";
import { setServiceOrderStatus } from "@/lib/service-orders";
import { SERVICE_ORDER_STATUSES, type ServiceOrderStatus } from "@/lib/services";
import { requireStaff } from "@/lib/session";

const MOVES: ServiceOrderStatus[] = ["in_progress", "delivered", "cancelled"];

/** Moves a service order on, as `npm run service-order` does. Delivering emails the owners. */
export async function moveServiceOrder(orderId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const status = formData.get("status") as ServiceOrderStatus;
  if (!MOVES.includes(status)) return { message: "Choose what to do with the order." };

  const result = await setServiceOrderStatus(db, createEmailSender(), orderId, status);
  if (!result.ok) return { message: result.error };
  revalidatePath("/staff", "layout");

  const done = [`Now "${SERVICE_ORDER_STATUSES[status]}".`];
  if (result.emailed.length > 0) done.push(`Emailed ${result.emailed.join(", ")}.`);
  if (result.emailError) done.push(`Couldn't email the owners (${result.emailError}), so tell them yourself.`);
  if (status === "delivered" && result.emailed.length === 0 && !result.emailError) {
    done.push("No owner has a confirmed address, so nobody was emailed.");
  }
  if (status === "cancelled") done.push("Refund them from the Paystack dashboard; the eTIMS credit note follows.");
  return { message: done.join(" ") };
}
