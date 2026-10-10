import type { NextRequest } from "next/server";
import { todayInKenya } from "@/lib/dates";
import { privacyNoticeHtml } from "@/lib/privacy-notice";
import { getPrivacyNotice } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { org } = await requireOrgContext();
  const { notice } = await getPrivacyNotice(org, request.nextUrl.searchParams.get("for"), todayInKenya());
  const slug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organisation";
  return new Response(privacyNoticeHtml(notice), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="privacy-notice-${slug}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
