import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/plans";
import { Contact, legalSeller, LegalTitle, sellerLine } from "../shared";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const seller = await legalSeller();
  return (
    <>
      <LegalTitle title="Terms of Service">
        <p>
          These terms are an agreement between {sellerLine(seller)} (&ldquo;we&rdquo;) and the organisation that uses
          Kinga (&ldquo;you&rdquo;). Whoever signs up accepts them for the organisation and confirms they may do so.
          Our <Link href="/dpa">Data Processing Agreement</Link> forms part of them, and our{" "}
          <Link href="/privacy">Privacy Notice</Link> explains how we handle personal data.
        </p>
      </LegalTitle>

      <h2>1. The service</h2>
      <p>
        Kinga is software for keeping track of obligations under the Data Protection Act, 2019: ODPC registration,
        records of processing, impact assessments, breaches and data subject requests. It organises your compliance
        work; it isn&apos;t legal advice, and using it doesn&apos;t make you compliant. Deadlines, fees and templates
        are our reading of the law and may not fit your circumstances. You remain responsible for meeting your
        obligations, including deadlines Kinga reminds you of.
      </p>

      <h2>2. Accounts and your team</h2>
      <ul>
        <li>Give accurate details and keep them up to date, especially the email addresses reminders go to.</li>
        <li>Keep passwords secret. You&apos;re responsible for what happens under your organisation&apos;s accounts.</li>
        <li>
          Owners and admins decide who is on the team and are responsible for removing people who should no longer
          have access.
        </li>
      </ul>

      <h2>3. Trial, fees and payment</h2>
      <ul>
        <li>New organisations get a {TRIAL_DAYS}-day free trial. No payment details are needed for it.</li>
        <li>
          After that, Kinga is paid for in advance, monthly or annually, at the price for your organisation&apos;s
          size shown on the Billing page. Each payment adds a month or a year after the current period ends.
        </li>
        <li>
          If you save a card for automatic renewal, we charge it for the same plan as each period ends until you turn
          renewal off or remove the card. We email owners before each charge.
        </li>
        <li>
          If a period ends unpaid, records become read-only until someone pays. Breaches, the team, settings, exports
          and deletion keep working.
        </li>
        <li>
          Expert services are priced and paid for separately. We&apos;ll agree what&apos;s covered when you order and
          deliver it within a reasonable time.
        </li>
        <li>
          Payments aren&apos;t refundable, except where the law requires, where we charged in error, or for a service
          we cancel before delivering.
        </li>
        <li>We&apos;ll give at least 30 days&apos; notice by email before changing prices. A change applies from your next payment.</li>
      </ul>

      <h2>4. Your data</h2>
      <p>
        What you put into Kinga stays yours. You give us permission to host and process it only to provide Kinga to
        you, as the Data Processing Agreement sets out. You&apos;re responsible for having a lawful basis for the
        personal data you record and for its accuracy. You can download all of it from Settings at any time.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>use Kinga for anything unlawful, or to store data you have no right to hold;</li>
        <li>try to reach other organisations&apos; data, or probe, overload or disrupt the service;</li>
        <li>share accounts, or resell Kinga without our written agreement.</li>
      </ul>

      <h2>6. Availability and changes</h2>
      <p>
        We aim to keep Kinga available and reminders on time, but can&apos;t promise uninterrupted service: emails can
        be delayed or filtered, and we sometimes need downtime for maintenance. We may improve or change features; if a
        change takes away something you rely on, we&apos;ll tell you in advance.
      </p>

      <h2>7. Liability</h2>
      <p>
        To the extent the law allows, our total liability under these terms is limited to what you paid us in the 12
        months before the claim, and neither of us is liable for indirect loss, such as lost profit or a fine for a
        breach of the Act that you committed. Nothing here limits liability that the law doesn&apos;t allow to be
        limited, or our obligations under the Data Processing Agreement.
      </p>

      <h2>8. Ending the agreement</h2>
      <p>
        You can stop at any time: an owner can delete the organisation from Settings, which deletes its records as
        our Privacy Notice describes. Download your data first. We may suspend or close an organisation that seriously
        or repeatedly breaks these terms, after warning you where we reasonably can. Unused paid time isn&apos;t
        refunded unless we close the organisation without cause.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We&apos;ll email owners at least 30 days before a change that matters takes effect. If you don&apos;t agree,
        you can delete the organisation before then.
      </p>

      <h2>10. Law</h2>
      <p>These terms are governed by the laws of Kenya, and the courts of Kenya have jurisdiction over disputes.</p>

      <h2>Contact</h2>
      <p>
        <Contact email={seller.email} />
        {seller.address && (
          <>
            <br />
            {seller.address.split("\n").map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </>
        )}
      </p>
    </>
  );
}
