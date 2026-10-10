import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { BackLink, buttonClass, cx, EmptyState, PageHeader } from "@/components/ui";
import { todayInKenya } from "@/lib/dates";
import type { NoticeBlock } from "@/lib/privacy-notice";
import { getPrivacyNotice } from "@/lib/queries";
import { requireOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Privacy notice" };

const noticeHref = (path: string, audience: string | null) => (audience ? `${path}?for=${encodeURIComponent(audience)}` : path);

function Block({ block }: { block: NoticeBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="whitespace-pre-line">{block.text}</p>;
    case "h3":
      return <h3>{block.text}</h3>;
    case "list":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "facts":
      return (
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr]">
          {block.items.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-stone-500">{f.label}</dt>
              <dd className="mb-2 whitespace-pre-line sm:mb-0">{f.value}</dd>
            </div>
          ))}
        </dl>
      );
  }
}

export default async function PrivacyNoticePage({ searchParams }: PageProps<"/ropa/notice">) {
  const { org } = await requireOrgContext();
  const { for: raw } = await searchParams;
  const { notice, audiences, activityCount } = await getPrivacyNotice(org, typeof raw === "string" ? raw : null, todayInKenya());

  return (
    <>
      <BackLink href="/ropa">Records of processing</BackLink>
      <PageHeader
        title="Privacy notice"
        description="Section 29 of the Act says you must tell people how you use their data before you collect it. This notice is written from your RoPA. Review it, then put it on your website, on forms and where you collect data."
        actions={
          activityCount > 0 && (
            <>
              <a href={noticeHref("/ropa/notice.html", notice.audience)} className={buttonClass.secondary}>
                Download HTML
              </a>
              <PrintButton />
            </>
          )
        }
      />

      {activityCount === 0 ? (
        <EmptyState title="Your RoPA is empty">
          The notice describes the processing in your RoPA, so add your activities first.
          <div className="mt-4">
            <Link href="/ropa/templates" className={buttonClass.primary}>
              Browse templates
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          {audiences.length > 1 && (
            <nav className="no-print mb-4 flex flex-wrap gap-1" aria-label="Who the notice is for">
              {[null, ...audiences].map((a) => (
                <Link
                  key={a ?? ""}
                  href={noticeHref("/ropa/notice", a)}
                  aria-current={notice.audience === a ? "page" : undefined}
                  className={cx(
                    "rounded-full px-3 py-1 text-sm",
                    notice.audience === a ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100",
                  )}
                >
                  {a ?? "Everyone"}
                </Link>
              ))}
            </nav>
          )}

          {notice.missing.length > 0 && (
            <div className="no-print mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">Before you publish it, add:</p>
              <ul className="mt-1 list-disc pl-5">
                {notice.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-2">
                Contact details are in <Link href="/settings" className="underline">Settings</Link>; the rest is in each{" "}
                <Link href="/ropa" className="underline">RoPA activity</Link>.
              </p>
            </div>
          )}

          <article className="legal rounded-lg bg-white p-6 ring-1 ring-stone-200 sm:p-10 print:p-0 print:ring-0">
            <h1>{notice.title}</h1>
            {notice.audience && <p className="mt-2 text-stone-500">For {notice.audience}</p>}
            {notice.sections.map((s) => (
              <section key={s.heading}>
                <h2>{s.heading}</h2>
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </section>
            ))}
          </article>
          <p className="no-print mt-4 text-xs text-stone-500">
            Kinga writes this from what you&apos;ve recorded. It isn&apos;t legal advice, so check it says what you actually do.
          </p>
        </>
      )}
    </>
  );
}
