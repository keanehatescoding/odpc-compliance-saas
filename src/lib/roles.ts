// Shared by server code and client forms, so kept free of database imports.
import type { MemberRole } from "@/db/schema";

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  owner:
    "Everything an admin can do, plus managing other owners. Owners get renewal reminders and deadline alerts unless Settings names another address.",
  admin: "Works on all records, changes organisation settings, and invites, changes and removes admins and members.",
  member: "Works on registrations, the RoPA, DPIAs, breaches and requests. Can't change settings or the team.",
};

/** Roles `actor` may hand out, by invitation or by changing someone's role. */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === "owner") return ["owner", "admin", "member"];
  if (actor === "admin") return ["admin", "member"];
  return [];
}

/** Whether `actor` may change, remove or uninvite someone with the `target` role. */
export function canManage(actor: MemberRole, target: MemberRole): boolean {
  return assignableRoles(actor).includes(target);
}
