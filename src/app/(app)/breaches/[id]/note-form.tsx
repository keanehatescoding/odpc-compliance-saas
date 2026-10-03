"use client";

import { useActionState } from "react";
import { addBreachUpdate } from "@/app/actions/breaches";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage, TextArea } from "@/components/ui";

export function NoteForm({ breachId }: { breachId: string }) {
  const [state, action] = useActionState(addBreachUpdate, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="breachId" value={breachId} />
      <FormMessage message={state?.message} tone={state?.message === "Note added." ? "success" : "error"} />
      <TextArea
        name="note"
        label="Add to the log"
        placeholder="e.g. Asked the group admin to delete the message; confirmed deleted at 14:20."
        errors={state?.errors}
        values={state?.values}
      />
      <SubmitButton variant="secondary" pendingText="Adding…">
        Add note
      </SubmitButton>
    </form>
  );
}
