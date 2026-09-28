import { SubmitButton } from "./submit-button";

/** Two-step delete without a browser confirm(): the first click reveals the real button. */
export function DeleteButton({ action, label = "Delete" }: { action: () => Promise<void>; label?: string }) {
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none text-sm font-medium text-red-700 hover:underline">{label}</summary>
      <form action={action} className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
        <p className="mb-3 text-sm text-stone-700">This can&apos;t be undone.</p>
        <SubmitButton variant="danger" pendingText="Deleting…">
          Yes, delete
        </SubmitButton>
      </form>
    </details>
  );
}
