import type { Metadata } from "next";
import {
  removeTeamMember,
  resendInvitation,
  updateMemberRole,
  withdrawInvitation,
} from "@/app/actions/team";
import { Card, PageHeader, Pill } from "@/components/ui";
import { db } from "@/db";
import { formatDateTime } from "@/lib/dates";
import { requireOrgContext } from "@/lib/session";
import { assignableRoles, canManage, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/roles";
import { pendingInvitations, teamMembers } from "@/lib/team";
import { ConfirmActionButton, InviteForm, RoleForm } from "./team-forms";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { user, org, role } = await requireOrgContext();
  const [members, invites] = await Promise.all([teamMembers(db, org.id), pendingInvitations(db, org.id)]);
  const roles = assignableRoles(role);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Team"
        description={`Everyone who can sign in to ${org.name}'s compliance records. Each person has their own account, so you can see who did what and remove access when someone leaves.`}
      />
      <div className="space-y-6">
        <Card className="p-0">
          <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">Members</h2>
          <ul className="divide-y divide-stone-100">
            {members.map((m) => {
              const manageable = canManage(role, m.role);
              const self = m.userId === user.id;
              return (
                <li key={m.userId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.name}
                      {self && <Pill>You</Pill>}
                      {!m.emailVerifiedAt && <Pill tone="amber">Email not confirmed</Pill>}
                    </p>
                    <p className="truncate text-sm text-stone-600">{m.email}</p>
                  </div>
                  {manageable ? (
                    <div className="flex items-start gap-4">
                      <RoleForm action={updateMemberRole.bind(null, m.userId)} roles={roles} current={m.role} />
                      {!self && (
                        <ConfirmActionButton
                          action={removeTeamMember.bind(null, m.userId)}
                          label="Remove"
                          confirm={`${m.name} will lose access to ${org.name} straight away.`}
                          confirmLabel="Yes, remove"
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-700">{ROLE_LABEL[m.role]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {invites.length > 0 && (
          <Card className="p-0">
            <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">Invitations</h2>
            <ul className="divide-y divide-stone-100">
              {invites.map((i) => {
                const expired = i.expiresAt <= now;
                return (
                  <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{i.email}</span>
                        {expired && <Pill tone="red">Expired</Pill>}
                      </p>
                      <p className="text-sm text-stone-600">
                        {ROLE_LABEL[i.role]}
                        {i.invitedBy && ` · invited by ${i.invitedBy}`}
                        {!expired && ` · link works until ${formatDateTime(i.expiresAt)}`}
                      </p>
                    </div>
                    {canManage(role, i.role) && (
                      <div className="flex items-start gap-4">
                        <ConfirmActionButton action={resendInvitation.bind(null, i.id)} label={expired ? "Send again" : "Resend"} />
                        <ConfirmActionButton
                          action={withdrawInvitation.bind(null, i.id)}
                          label="Withdraw"
                          confirm="The link in the invitation will stop working."
                          confirmLabel="Yes, withdraw"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {roles.length > 0 ? (
          <InviteForm roles={roles} />
        ) : (
          <p className="text-sm text-stone-600">Only owners and admins can invite people or change roles.</p>
        )}

        <Card>
          <h2 className="font-semibold">Roles</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {(["owner", "admin", "member"] as const).map((r) => (
              <div key={r}>
                <dt className="font-medium">{ROLE_LABEL[r]}</dt>
                <dd className="text-stone-600">{ROLE_DESCRIPTION[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
