import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink, Card, PageHeader, Pill } from "@/components/ui";
import { db } from "@/db";
import { formatPaymentAmount, formatReceiptNumber, paymentMethod, receiptDescription } from "@/lib/billing";
import { formatDate, formatDateTime, todayInKenya } from "@/lib/dates";
import { ORG_SIZES, SECTORS, type OrgSize, type Sector } from "@/lib/dpa";
import { BILLING_INTERVALS, cardExpiry, cardLabel, type BillingInterval } from "@/lib/plans";
import { ROLE_LABEL } from "@/lib/roles";
import { SERVICE_ORDER_STATUSES, SERVICES, type ServiceKey, type ServiceOrderStatus } from "@/lib/services";
import { requireStaff } from "@/lib/session";
import { orgDetail } from "@/lib/staff";
import { isUuid } from "@/lib/uuid";
import { AccessBadge } from "../../access-badge";

export const metadata: Metadata = { title: "Organisation" };

const RECORD_LABELS = {
  registrations: "ODPC registrations",
  ropa: "RoPA activities",
  dpias: "Impact assessments",
  breaches: "Breaches",
  requests: "Data subject requests",
  processors: "Processors",
} as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-0">
      <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

const th = "px-5 py-2 font-medium";
const td = "px-5 py-3";

export default async function StaffOrganisationPage({ params }: PageProps<"/staff/organisations/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await orgDetail(db, id);
  if (!d) notFound();
  const { org, access, card } = d;

  return (
    <>
      <BackLink href="/staff/organisations">Organisations</BackLink>
      <PageHeader title={org.name} description={`${SECTORS[org.sector as Sector]} · ${ORG_SIZES[org.size as OrgSize]}`} />
      <div className="space-y-6">
        <Card>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Access">
              <AccessBadge access={access} deletedAt={org.deletedAt} />
            </Fact>
            <Fact label="Signed up">{formatDate(todayInKenya(org.createdAt))}</Fact>
            <Fact label="Trial ends">{formatDate(todayInKenya(org.trialEndsAt))}</Fact>
            <Fact label="Paid until">{org.paidUntil ? formatDate(todayInKenya(org.paidUntil)) : "Never paid"}</Fact>
            <Fact label="Automatic renewal">
              {org.autoRenewInterval ? BILLING_INTERVALS[org.autoRenewInterval as BillingInterval] : "Off"}
            </Fact>
            <Fact label="Saved card">
              {card ? `${cardLabel(card)}${cardExpiry(card) ? `, expires ${cardExpiry(card)}` : ""}` : "None"}
            </Fact>
            <Fact label="KRA PIN">{org.kraPin || "—"}</Fact>
            <Fact label="Reminders go to">{org.reminderEmail || "Owners"}</Fact>
            {org.deletedAt && <Fact label="Deleted">{formatDateTime(org.deletedAt)}</Fact>}
          </dl>
        </Card>

        <Section title="Getting started">
          <dl className="grid gap-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(RECORD_LABELS) as (keyof typeof RECORD_LABELS)[]).map((k) => (
              <Fact key={k} label={RECORD_LABELS[k]}>
                {d.counts[k]}
              </Fact>
            ))}
            <Fact label="Last change">{d.lastChangeAt ? formatDateTime(d.lastChangeAt) : "Nothing yet"}</Fact>
          </dl>
          <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">
            Counts only. The records are theirs: our DPA promises that only their team can see them.
          </p>
        </Section>

        <Section title="Team">
          {d.team.length === 0 ? (
            <p className="px-5 py-4 text-sm text-stone-600">Nobody. The organisation was deleted, or everyone left.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Email</th>
                    <th className={th}>Role</th>
                    <th className={th}>Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {d.team.map((m) => (
                    <tr key={m.userId}>
                      <td className={td}>{m.name}</td>
                      <td className={td}>
                        {m.email}
                        {!m.verifiedAt && (
                          <>
                            {" "}
                            <Pill tone="amber">unconfirmed</Pill>
                          </>
                        )}
                      </td>
                      <td className={td}>{ROLE_LABEL[m.role]}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(todayInKenya(m.joinedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.pendingInvitations > 0 && (
            <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">
              {d.pendingInvitations} pending {d.pendingInvitations === 1 ? "invitation" : "invitations"}.
            </p>
          )}
        </Section>

        <Section title="Payments">
          {d.payments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-stone-600">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className={th}>Paid</th>
                    <th className={th}>Receipt</th>
                    <th className={th}>For</th>
                    <th className={th}>Method</th>
                    <th className={`${th} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {d.payments.map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} whitespace-nowrap`}>{p.paidAt && formatDate(todayInKenya(p.paidAt))}</td>
                      <td className={`${td} whitespace-nowrap`}>{p.receiptNumber !== null && formatReceiptNumber(p.receiptNumber)}</td>
                      <td className={td}>{receiptDescription(p)}</td>
                      <td className={td}>{paymentMethod(p.channel)}</td>
                      <td className={`${td} text-right whitespace-nowrap`}>{formatPaymentAmount(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.renewals.length > 0 && (
            <div className="border-t border-stone-200 px-5 py-4">
              <h3 className="text-sm font-medium">Automatic renewal charges</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {d.renewals.map(({ attempt: r, paymentStatus }) => (
                  <li key={r.id}>
                    {formatDateTime(r.createdAt)}: attempt {r.attempt} for the period ending {formatDate(todayInKenya(r.endsAt))}
                    {r.error ? (
                      <span className="text-red-700">, failed: {r.error}</span>
                    ) : paymentStatus === "succeeded" ? (
                      ", charged"
                    ) : (
                      ", waiting for Paystack"
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {d.orders.length > 0 && (
          <Section title="Service orders">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className={th}>Paid</th>
                    <th className={th}>Service</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {d.orders.map(({ order, payment }) => (
                    <tr key={order.id}>
                      <td className={`${td} whitespace-nowrap`}>{payment.paidAt && formatDate(todayInKenya(payment.paidAt))}</td>
                      <td className={td}>{SERVICES[payment.service as ServiceKey].name}</td>
                      <td className={td}>{SERVICE_ORDER_STATUSES[order.status as ServiceOrderStatus]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
