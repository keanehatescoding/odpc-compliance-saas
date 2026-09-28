import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { ODPC_FEES, REGISTRATION_ROLES, formatKsh, type OrgSize, type RegistrationRole } from "@/lib/dpa";
import { listActivities, listRegistrations, recentReminders } from "@/lib/queries";
import { daysUntilExpiry, registrationStatus, STATUS_SEVERITY, worstStatus } from "@/lib/registration";
import { dpiaRecommended } from "@/lib/ropa";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const [regs, activities, reminders] = await Promise.all([
    listRegistrations(org.id),
    listActivities(org.id),
    recentReminders(org.id),
  ]);

  const regRows = regs
    .map((r) => ({ ...r, status: registrationStatus(r, today), daysLeft: daysUntilExpiry(r, today) }))
    .sort((a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]);
  const headline = worstStatus(regRows.map((r) => r.status));
  const needsDpia = activities.filter(dpiaRecommended);
  const sensitive = activities.filter((a) => a.sensitiveCategories.length > 0);
  const crossBorder = activities.filter((a) => a.crossBorder);

  const todos: { text: string; href: string }[] = [];
  if (regRows.length === 0) todos.push({ text: "Add your ODPC registration certificate", href: "/registrations/new" });
  for (const r of regRows) {
    const role = REGISTRATION_ROLES[r.role as RegistrationRole].toLowerCase();
    if (r.status === "expired") todos.push({ text: `Renew your ${role} registration. It has expired.`, href: `/registrations/${r.id}` });
    else if (r.status === "expiring_soon" || r.status === "renewal_due")
      todos.push({ text: `Renew your ${role} registration (${r.daysLeft} days left)`, href: `/registrations/${r.id}` });
    else if (r.status === "not_started") todos.push({ text: `Apply for your ${role} registration`, href: `/registrations/${r.id}` });
  }
  if (activities.length === 0) todos.push({ text: "Start your Record of Processing Activities", href: "/ropa/templates" });
  if (needsDpia.length > 0)
    todos.push({ text: `Review ${needsDpia.length} ${needsDpia.length === 1 ? "activity" : "activities"} that may need a DPIA`, href: "/ropa?filter=dpia" });

  return (
    <>
      <PageHeader title="Compliance overview" description={`${org.name} · as of ${formatDate(today)}`} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">ODPC registration</h2>
            <StatusBadge status={headline} />
          </div>
          {regRows.length === 0 ? (
            <p className="mt-4 text-sm text-stone-600">
              No registration recorded yet. Most organisations that process personal data must register with the ODPC as
              a data controller, a data processor, or both.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {regRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/registrations/${r.id}`} className="font-medium hover:underline">
                      {REGISTRATION_ROLES[r.role as RegistrationRole]}
                    </Link>
                    <p className="text-sm text-stone-600">
                      {r.expiresOn ? (
                        <>
                          Expires {formatDate(r.expiresOn)}
                          {r.daysLeft !== null &&
                            (r.daysLeft >= 0 ? ` · ${r.daysLeft} days left` : ` · ${-r.daysLeft} days overdue`)}
                        </>
                      ) : r.appliedOn ? (
                        `Applied ${formatDate(r.appliedOn)}`
                      ) : (
                        "Not yet applied"
                      )}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-stone-500">
            Indicative renewal fee for your size band: {formatKsh(ODPC_FEES[org.size as OrgSize].renewal)}
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold">Next steps</h2>
          {todos.length === 0 ? (
            <p className="mt-4 text-sm text-stone-600">Nothing outstanding. Your reminders will flag the next renewal.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {todos.map((t) => (
                <li key={t.text} className="flex gap-2 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
                  <Link href={t.href} className="hover:underline">
                    {t.text}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Processing activities" value={activities.length} href="/ropa" />
        <Stat label="DPIA recommended" value={needsDpia.length} href="/ropa?filter=dpia" warn={needsDpia.length > 0} />
        <Stat label="Involve sensitive data" value={sensitive.length} href="/ropa?filter=sensitive" />
        <Stat label="Transfers outside Kenya" value={crossBorder.length} href="/ropa?filter=cross-border" />
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent reminders</h2>
          <Link href="/settings" className={buttonClass.link}>
            Reminder settings
          </Link>
        </div>
        {reminders.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">
            None sent yet. Reminders go out 90, 60, 30, 14, 7 and 1 days before a certificate expires.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100 text-sm">
            {reminders.map((r) => (
              <li key={r.id} className="flex justify-between gap-4 py-2">
                <span>
                  {REGISTRATION_ROLES[r.role as RegistrationRole]} ·{" "}
                  {r.thresholdDays > 0
                    ? `${r.thresholdDays}-day notice`
                    : r.thresholdDays === 0
                      ? "expiry-day notice"
                      : `${-r.thresholdDays} days overdue`}
                </span>
                <span className="text-stone-500">
                  {r.recipients.join(", ")} · {r.sentAt.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, href, warn }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="block rounded-lg border border-stone-200 bg-white p-5 shadow-xs hover:border-stone-300">
      <p className="text-sm text-stone-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${warn ? "text-amber-700" : ""}`}>{value}</p>
    </Link>
  );
}
