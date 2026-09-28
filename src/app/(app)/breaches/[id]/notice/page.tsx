import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { BackLink, Card } from "@/components/ui";
import { notificationSections, subjectNoticeSections } from "@/lib/breach";
import { formatDate, todayInKenya } from "@/lib/dates";
import { breachActivityList, getBreach, listRegistrations } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Breach notification" };

export default async function BreachNoticePage({ params, searchParams }: PageProps<"/breaches/[id]/notice">) {
  const { id } = await params;
  const forSubjects = (await searchParams).for === "subjects";
  const { org } = await requireOrgContext();
  const breach = isUuid(id) ? await getBreach(org.id, id) : null;
  if (!breach) notFound();

  const [activities, regs] = await Promise.all([breachActivityList(breach.id), listRegistrations(org.id)]);
  const certificateNumber = regs.find((r) => r.role === breach.role)?.certificateNumber;
  const processor = breach.role === "processor";

  const title = forSubjects
    ? "Notice of a personal data breach"
    : processor
      ? "Notification of a personal data breach to the data controller"
      : "Notification of a personal data breach to the Data Commissioner";
  const sections = forSubjects
    ? subjectNoticeSections(breach, { orgName: org.name })
    : notificationSections(breach, {
        orgName: org.name,
        certificateNumber,
        activities: activities.map((a) => a.name),
        now: new Date(),
      });
  const gaps = sections.filter((s) => s.missing);

  return (
    <div className="bg-white p-8 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <BackLink href={`/breaches/${breach.id}`}>Back to breach</BackLink>
        <PrintButton />
      </div>

      <Card className="no-print mb-8 max-w-3xl border-amber-300 bg-amber-50 text-sm text-stone-700">
        <p>
          {forSubjects
            ? "A draft to adapt before sending. Use plain language and the channel people are most likely to see, such as SMS, email or a letter."
            : processor
              ? "A draft to send to the controller whose data was affected. They decide whether to notify the ODPC."
              : "A draft to help you complete the ODPC's breach notification. Submit it through the channel the ODPC currently specifies. You can send what you know now and follow up with the rest."}
        </p>
        {gaps.length > 0 && (
          <p className="mt-2">
            Still to fill in: {gaps.map((g) => g.heading.toLowerCase()).join(", ")}. Edit the breach to complete them.
          </p>
        )}
      </Card>

      <article className="max-w-3xl">
        <header className="mb-6 border-b border-stone-300 pb-4">
          <p className="text-sm text-stone-600">{formatDate(todayInKenya())}</p>
          <h1 className="mt-1 text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {org.name}
            {!forSubjects && " · under section 43 of the Data Protection Act, 2019"}
          </p>
        </header>
        {sections.map((s) => (
          <section key={s.heading} className="mb-5 break-inside-avoid">
            <h2 className="mb-1 font-semibold">{s.heading}</h2>
            <p className={`text-sm whitespace-pre-line ${s.missing ? "text-amber-800" : ""}`}>{s.body}</p>
          </section>
        ))}
      </article>
    </div>
  );
}
