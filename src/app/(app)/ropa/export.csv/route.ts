import { listActivities } from "@/lib/queries";
import { ropaToCsv, type ActivityInput } from "@/lib/ropa";
import { todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";

export async function GET() {
  const { org } = await requireOrgContext();
  const activities = await listActivities(org.id);
  const csv = ropaToCsv(activities as ActivityInput[]);
  const slug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organisation";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ropa-${slug}-${todayInKenya()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
