import { db } from "@/db";
import { exportOrganization } from "@/lib/account";
import { todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";

// Everything the organisation keeps in Kinga, as one JSON file, for owners and admins.
export async function GET() {
  const { org, role } = await requireOrgContext();
  if (role === "member") return new Response("Only owners and admins can export the organisation's data.", { status: 403 });
  const data = await exportOrganization(db, org.id);
  const slug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organisation";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kinga-${slug}-${todayInKenya()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
