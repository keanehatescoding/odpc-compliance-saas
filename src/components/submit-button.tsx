"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: keyof typeof buttonClass;
  /** Sent with the form when this button submits it. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass[variant]}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
