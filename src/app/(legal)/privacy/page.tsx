import type { Metadata } from "next";
import Link from "next/link";
import { TAX_RECORD_YEARS } from "@/lib/legal";
import { Contact, legalSeller, LegalTitle, sellerLine, SubprocessorTable } from "../shared";

export const metadata: Metadata = { title: "Privacy Notice" };

export default async function PrivacyPage() {
  const seller = await legalSeller();
  return (
    <>
      <LegalTitle title="Privacy Notice">
        <p>
          This notice explains what personal data Kinga collects, why, who sees it, how long we keep it and the rights
          you have over it under the Data Protection Act, 2019.
        </p>
      </LegalTitle>

      <h2>Who we are</h2>
      <p>
        Kinga is run by {sellerLine(seller)}. For anything about your personal data, contact us at{" "}
        <Contact email={seller.email} />.
      </p>

      <h2>Our two roles</h2>
      <ul>
        <li>
          <strong>Controller</strong> of the data we need to run your account and bill you: who you are, how you sign
          in and what you pay. This notice covers that data.
        </li>
        <li>
          <strong>Processor</strong> of the records your organisation keeps in Kinga: its records of processing,
          impact assessments, breach log and data subject requests, which can contain other people&apos;s personal
          data. Your organisation decides what goes in them and is their controller. Our{" "}
          <Link href="/dpa">Data Processing Agreement</Link> covers how we handle them.
        </li>
      </ul>

      <h2>What we collect and why</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>Data</th>
              <th>Why</th>
              <th>Lawful basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Your name, email address and password (stored only as a scrypt hash)</td>
              <td>To create your account, sign you in and send you the emails the service depends on</td>
              <td>Contract</td>
            </tr>
            <tr>
              <td>Your organisation&apos;s name, sector, size, KRA PIN, reminder addresses and your role in it</td>
              <td>To set up the organisation, work out fees and deadlines, and send reminders and alerts</td>
              <td>Contract</td>
            </tr>
            <tr>
              <td>Email addresses of people you invite</td>
              <td>To send them the invitation</td>
              <td>Legitimate interest of the inviting organisation</td>
            </tr>
            <tr>
              <td>
                Payments: amounts, dates, the payment method, the name and KRA PIN billed, and for a saved card its
                brand, last four digits, expiry and the email Paystack holds it under. We never see the full card
                number.
              </td>
              <td>To take payment, renew automatically if you ask, and issue receipts and eTIMS invoices</td>
              <td>Contract; legal obligation for tax records</td>
            </tr>
            <tr>
              <td>Your IP address and the email addresses used to sign in, held for up to a day</td>
              <td>To limit repeated sign-in, signup and password reset attempts</td>
              <td>Legitimate interest in keeping accounts secure</td>
            </tr>
            <tr>
              <td>A session cookie</td>
              <td>To keep you signed in for up to 30 days</td>
              <td>Contract (it&apos;s strictly necessary)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We don&apos;t use advertising or analytics trackers, don&apos;t sell personal data and don&apos;t use it for
        marketing beyond telling you about Kinga itself. Without your name, email and password we can&apos;t give you
        an account, and without payment details we can&apos;t take payment.
      </p>

      <h2>Who we share it with</h2>
      <p>These providers process personal data for us, under contracts that require them to protect it:</p>
      <SubprocessorTable />
      <p>
        Each sale is reported to the Kenya Revenue Authority through eTIMS with the buyer&apos;s name, KRA PIN and the
        amount, as the law requires. We may also disclose data where the law or a court requires it.
      </p>

      <h2>Transfers outside Kenya</h2>
      <p>
        Kinga is hosted, and its email delivered, outside Kenya, so personal data is transferred abroad under
        sections 48 to 50 of the Act. We only use providers that give appropriate safeguards for its security, by
        contract, and data is encrypted in transit.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account, until you delete it.</li>
        <li>Your organisation&apos;s records, until an owner deletes the organisation or deletes them.</li>
        <li>
          The organisation&apos;s activity history, which names who made each change, until the organisation is deleted.
          Deleting your account keeps your name on the changes you made, so the organisation can still show who did
          what.
        </li>
        <li>
          Receipts, eTIMS invoices and refunds for {TAX_RECORD_YEARS} years after the payment, as tax law requires,
          even if the organisation is deleted. They keep the name and KRA PIN they were billed to.
        </li>
        <li>
          Checkouts that were never paid, 30 days. Sign-in and reset links, until they expire or are used. Invitations,
          until accepted or 30 days after they expire.
        </li>
      </ul>
      <p>Deleted data can remain in backups until they are overwritten.</p>

      <h2>How we protect it</h2>
      <p>
        Data travels over HTTPS. Passwords are hashed with scrypt, and sign-in, reset and invitation tokens are stored
        only as hashes. Every record is scoped to its organisation, and only its team can see it. Card numbers never
        reach us. If a breach of your personal data creates a real risk of harm, we&apos;ll tell you and the Data
        Commissioner as section 43 requires.
      </p>

      <h2>Your rights</h2>
      <p>Under section 26 of the Act you can:</p>
      <ul>
        <li>be told how your personal data is used (this notice);</li>
        <li>see the personal data we hold about you;</li>
        <li>object to our processing of it;</li>
        <li>have false or misleading data corrected;</li>
        <li>have false, misleading or unneeded data deleted; and</li>
        <li>receive your data in a structured, machine-readable form (section 38).</li>
      </ul>
      <p>
        Most of this you can do yourself. Settings shows and corrects your details, lets owners and admins download
        everything the organisation keeps in Kinga, and lets you delete your account or, as an owner, the whole
        organisation. For anything else, email <Contact email={seller.email} />. We&apos;ll answer within the time the
        Data Protection (General) Regulations, 2021 allow.
      </p>
      <p>
        If you&apos;re unhappy with how we handle your data, you can complain to the{" "}
        <a href="https://www.odpc.go.ke">Office of the Data Protection Commissioner</a>.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this notice in a way that matters, we&apos;ll email account holders before the change takes
        effect. The date at the top shows the current version.
      </p>
    </>
  );
}
