import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRegistration } from "@/app/actions/registrations";
import { DeleteButton } from "@/components/delete-button";
import { BackLink, PageHeader } from "@/components/ui";
import { REGISTRATION_ROLES, type RegistrationRole } from "@/lib/dpa";
import { getRegistration } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { RegistrationForm } from "../registration-form";

export const metadata: Metadata = { title: "Edit registration" };

export default async function EditRegistrationPage({ params }: PageProps<"/registrations/[id]">) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const registration = isUuid(id) ? await getRegistration(org.id, id) : null;
  if (!registration) notFound();

  return (
    <>
      <BackLink href="/registrations">Registrations</BackLink>
      <PageHeader
        title={REGISTRATION_ROLES[registration.role as RegistrationRole]}
        description="When you renew, enter the new application date. Once the new certificate is issued, update the issue and expiry dates."
        actions={<DeleteButton action={deleteRegistration.bind(null, registration.id)} />}
      />
      <RegistrationForm registration={registration} />
    </>
  );
}
