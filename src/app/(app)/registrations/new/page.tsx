import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { RegistrationForm } from "../registration-form";

export const metadata: Metadata = { title: "Add registration" };

export default function NewRegistrationPage() {
  return (
    <>
      <BackLink href="/registrations">Registrations</BackLink>
      <PageHeader title="Add registration" description="Enter the details from your ODPC certificate, or just the application date if it hasn't been issued yet." />
      <RegistrationForm />
    </>
  );
}
