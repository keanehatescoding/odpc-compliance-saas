import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import { ODPC_FEES, REGISTRATION_ROLES, formatKsh, type OrgSize, type RegistrationRole } from "@/lib/dpa";
import { listRegistrations } from "@/lib/queries";
import { daysUntilExpiry, registrationStatus, renewalFiled } from "@/lib/registration";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "ODPC registration" };

export default async function RegistrationsPage() {
  const { org } = await requireOrgContext();
  const today = todayInKenya();
  const regs = await listRegistrations(org.id);
  const fees = ODPC_FEES[org.size as OrgSize];

  return (
    <>
      <PageHeader
        title="ODPC registration"
        description="Your data controller and processor certificates. Certificates are valid for 24 months, and reminders are emailed as expiry approaches."
        actions={
          regs.length < 2 && (
            <Link href="/registrations/new" className={buttonClass.primary}>
              Add registration
            </Link>
          )
        }
      />

      {regs.length === 0 ? (
        <EmptyState title="No registrations yet">
          Add the certificate the ODPC issued you, or record the date you applied.
          <div className="mt-4">
            <Link href="/registrations/new" className={buttonClass.primary}>
              Add registration
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {regs.map((r) => {
            const status = registrationStatus(r, today);
            const left = daysUntilExpiry(r, today);
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{REGISTRATION_ROLES[r.role as RegistrationRole]}</h2>
                    <p className="text-sm text-stone-600">
                      {r.certificateNumber ? `Certificate ${r.certificateNumber}` : "No certificate number recorded"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={status} />
                    <Link href={`/registrations/${r.id}`} className={buttonClass.link}>
                      Edit
                    </Link>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Detail label="Applied" value={formatDate(r.appliedOn)} />
                  <Detail label="Issued" value={formatDate(r.issuedOn)} />
                  <Detail label="Expires" value={formatDate(r.expiresOn)} />
                  <Detail
                    label="Time left"
                    value={left === null ? "—" : left >= 0 ? `${left} days` : `Overdue by ${-left} days`}
                  />
                </dl>
                {renewalFiled(r) && (
                  <p className="mt-4 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    Renewal filed on {formatDate(r.appliedOn)}. Reminders are paused. Update the issue and expiry dates when the
                    new certificate arrives.
                  </p>
                )}
                {r.notes && <p className="mt-4 text-sm whitespace-pre-line text-stone-700">{r.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6 text-sm text-stone-700">
        <h2 className="font-semibold text-stone-900">Fees for your size band</h2>
        <p className="mt-2">
          Registration {formatKsh(fees.registration)} · Renewal {formatKsh(fees.renewal)}. These are indicative figures from the
          Registration Regulations, 2021. Confirm them on the ODPC portal before paying.
        </p>
      </Card>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
