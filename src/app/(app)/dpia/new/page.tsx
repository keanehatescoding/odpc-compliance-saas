import type { Metadata } from "next";
import { startDpia } from "@/app/actions/dpia";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, Card, PageHeader, SelectField } from "@/components/ui";
import { DPIA_TEMPLATES, dpiaTemplatesForSector } from "@/lib/dpia";
import type { Sector } from "@/lib/dpa";
import { listActivities, listDpias } from "@/lib/queries";
import { dpiaRecommended } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "New DPIA" };

export default async function NewDpiaPage() {
  const { org } = await requireOrgContext();
  const [activities, dpias] = await Promise.all([listActivities(org.id), listDpias(org.id)]);
  const assessed = new Set(dpias.map((d) => d.dpia.activityId));
  const available = activities
    .filter((a) => !assessed.has(a.id))
    .sort((a, b) => Number(dpiaRecommended(b)) - Number(dpiaRecommended(a)));

  const forSector = dpiaTemplatesForSector(org.sector as Sector);
  const others = DPIA_TEMPLATES.filter((t) => !forSector.includes(t));

  return (
    <>
      <BackLink href="/dpia">Impact assessments</BackLink>
      <PageHeader
        title="Start a DPIA"
        description="Assess processing you already do from its RoPA entry, or plan new processing from a template. You can edit everything afterwards."
      />

      <div className="max-w-3xl space-y-6">
        {available.length > 0 && (
          <Card>
            <h2 className="font-semibold">For an activity in your RoPA</h2>
            <p className="mt-1 text-sm text-stone-600">
              The DPIA starts from what the RoPA already records, plus the matching template where there is one.
            </p>
            <form action={startDpia} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <SelectField
                  name="activityId"
                  label="Processing activity"
                  options={Object.fromEntries(
                    available.map((a) => [a.id, dpiaRecommended(a) ? `${a.name} (DPIA recommended)` : a.name]),
                  )}
                />
              </div>
              <SubmitButton pendingText="Starting…">Start DPIA</SubmitButton>
            </form>
          </Card>
        )}

        <Card>
          <h2 className="font-semibold">For new processing</h2>
          <p className="mt-1 text-sm text-stone-600">
            Do the DPIA before you start, for example before installing CCTV or launching an app. Templates come with typical
            risks and measures.
          </p>
          <ul className="mt-4 divide-y divide-stone-100">
            {[...forSector, ...others].map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="max-w-xl">
                  <p className="font-medium">{t.name}</p>
                  <p className="line-clamp-2 text-sm text-stone-600">{t.purposes}</p>
                </div>
                <form action={startDpia}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <SubmitButton variant="secondary" pendingText="Starting…">
                    Use template
                  </SubmitButton>
                </form>
              </li>
            ))}
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">Blank DPIA</p>
                <p className="text-sm text-stone-600">Start from an empty assessment.</p>
              </div>
              <form action={startDpia}>
                <SubmitButton variant="secondary" pendingText="Starting…">
                  Start blank
                </SubmitButton>
              </form>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
