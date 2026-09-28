import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "New processing activity" };

export default function NewActivityPage() {
  return (
    <>
      <BackLink href="/ropa">Records of processing</BackLink>
      <PageHeader title="New processing activity" />
      <ActivityForm />
    </>
  );
}
