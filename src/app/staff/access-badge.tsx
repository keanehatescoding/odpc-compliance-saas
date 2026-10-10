import { cx } from "@/components/ui";
import { formatDate, todayInKenya } from "@/lib/dates";
import type { Access, AccessState } from "@/lib/plans";

const ACCESS_LABEL: Record<AccessState, string> = { trial: "Trial", active: "Paying", lapsed: "Lapsed" };

const ACCESS_STYLE: Record<AccessState, string> = {
  trial: "bg-sky-50 text-sky-800 ring-sky-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  lapsed: "bg-red-50 text-red-800 ring-red-300",
};

/** Trial, paying or lapsed, and when that ends (or ended). */
export function AccessBadge({ access, deletedAt }: { access: Access; deletedAt: Date | null }) {
  if (deletedAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 ring-inset">
        Deleted
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap">
      <span
        className={cx(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
          ACCESS_STYLE[access.state],
        )}
      >
        {ACCESS_LABEL[access.state]}
      </span>
      <span className="ml-2 text-xs text-stone-500">
        {access.state === "lapsed" ? "since" : "to"} {formatDate(todayInKenya(access.endsAt))}
      </span>
    </span>
  );
}
