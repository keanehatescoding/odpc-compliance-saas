import { connection } from "next/server";
import { sellerFromEnv } from "@/lib/billing";
import { formatDate } from "@/lib/dates";
import { SUBPROCESSORS, TERMS_VERSION } from "@/lib/legal";

/** The business behind Kinga, from SELLER_* at request time (not at build). */
export async function legalSeller() {
  await connection();
  return sellerFromEnv();
}

export function LegalTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="text-stone-500">Last updated {formatDate(TERMS_VERSION)}</p>
      {children}
    </>
  );
}

/** "Name, KRA PIN …, address", for naming the seller in a sentence. */
export function sellerLine(seller: Awaited<ReturnType<typeof legalSeller>>): string {
  return [seller.name, seller.kraPin && `KRA PIN ${seller.kraPin}`, seller.address?.replaceAll("\n", ", ")]
    .filter(Boolean)
    .join(", ");
}

/** How to reach us, or a fallback when SELLER_EMAIL isn't set. */
export function Contact({ email }: { email: string | null }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <>the contact details on your receipt</>;
}

export function SubprocessorTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th>Who</th>
            <th>What they do</th>
            <th>Where</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td>{s.name}</td>
              <td>{s.what}</td>
              <td>{s.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
