import { db } from "@/db";
import { exportOrganization } from "@/lib/account";
import { recordActivity } from "@/lib/activity";
import { todayInKenya } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";

// Everything the organisation keeps in Kinga, as one JSON file, for owners and admins.
export async function GET() {
  const { user, org, role } = await requireOrgContext();
  if (role === "member") return new Response("Only owners and admins can export the organisation's data.", { status: 403 });
  // Logged first, so the file includes its own download; one transaction, so a failed export leaves no entry.
  const data = await db.transaction(async (tx) => {
    await recordActivity(tx, { orgId: org.id, actorId: user.id, area: "organization", subjectId: org.id, summary: "downloaded all the organisation's data" });
    return exportOrganization(tx, org.id);
  });
  const slug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organisation";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kinga-${slug}-${todayInKenya()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
