import type { Metadata } from "next";
import { addTemplates } from "@/app/actions/ropa";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, Card, PageHeader, Pill } from "@/components/ui";
import { ACTIVITY_TEMPLATES, dpiaRecommended, templatesForSector } from "@/lib/ropa";
import { SECTORS, type Sector } from "@/lib/dpa";
import { listActivities } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "RoPA templates" };

export default async function TemplatesPage() {
  const { org } = await requireOrgContext();
  const sector = org.sector as Sector;
  const existing = new Set((await listActivities(org.id)).map((a) => a.templateId).filter(Boolean));
  const forSector = templatesForSector(sector);
  const others = ACTIVITY_TEMPLATES.filter((t) => !forSector.includes(t));

  return (
    <>
      <BackLink href="/ropa">Records of processing</BackLink>
      <PageHeader
        title="Start from templates"
        description={`Tick the activities your organisation carries out. Each one is added to your RoPA pre-filled, ready for you to edit. Suggested for ${SECTORS[sector].toLowerCase()}.`}
      />
      <form action={addTemplates} className="space-y-6">
        <TemplateGroup title="Suggested for your sector" templates={forSector} existing={existing} defaultChecked />
        <TemplateGroup title="Other templates" templates={others} existing={existing} />
        <div className="sticky bottom-4">
          <SubmitButton pendingText="Adding…">Add selected to RoPA</SubmitButton>
        </div>
      </form>
    </>
  );
}

function TemplateGroup({
  title,
  templates,
  existing,
  defaultChecked,
}: {
  title: string;
  templates: typeof ACTIVITY_TEMPLATES;
  existing: Set<string | null>;
  defaultChecked?: boolean;
}) {
  if (templates.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-stone-700 uppercase">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const added = existing.has(t.id);
          return (
            <Card key={t.id} className={added ? "opacity-60" : ""}>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  name="templateId"
                  value={t.id}
                  defaultChecked={defaultChecked && !added}
                  disabled={added}
                  className="mt-1 size-4 accent-brand-600"
                />
                <span>
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {t.name}
                    {added && <Pill>Added</Pill>}
                    {dpiaRecommended(t) && <Pill tone="amber">DPIA</Pill>}
                  </span>
                  <span className="mt-1 block text-sm text-stone-600">{t.purpose}</span>
                </span>
              </label>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
