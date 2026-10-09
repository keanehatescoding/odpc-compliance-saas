import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";

export default async function StaffHome() {
  await requireStaff();
  redirect("/staff/organisations");
}
