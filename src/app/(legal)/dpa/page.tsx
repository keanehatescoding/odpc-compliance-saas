import type { Metadata } from "next";
import Link from "next/link";
import { Contact, legalSeller, LegalTitle, sellerLine, SubprocessorTable } from "../shared";

export const metadata: Metadata = { title: "Data Processing Agreement" };

export default async function DpaPage() {
  const seller = await legalSeller();
  return (
    <>
      <LegalTitle title="Data Processing Agreement">
        <p>
          This agreement is part of our <Link href="/terms">Terms of Service</Link>. It sets out how{" "}
          {sellerLine(seller)} (&ldquo;we&rdquo;), as data processor, handles personal data in the records your
          organisation (&ldquo;you&rdquo;), as data controller, keeps in Kinga, as section 42 of the Data Protection Act,
          2019 requires. It applies for as long as you use Kinga and then until that data is deleted.
        </p>
      </LegalTitle>

      <h2>1. The processing</h2>
      <ul>
        <li>
          <strong>Subject matter and purpose:</strong> hosting, displaying, exporting and printing your compliance
          records, and sending the reminders and alerts you rely on, so you can meet your obligations under the Act.
        </li>
        <li>
          <strong>Nature:</strong> storage, retrieval, organisation and transmission by email, on your instructions.
        </li>
        <li>
          <strong>Personal data:</strong> whatever you record in your records of processing, impact assessments,
          breach log and data subject requests: typically names, contact details, descriptions of incidents and
          requests, identity checks and responses. It may include sensitive personal data if you record it.
        </li>
        <li>
          <strong>Data subjects:</strong> the people your records are about, such as your customers, staff, students,
          patients or members, people who make data subject requests and their representatives, and your team.
        </li>
        <li>
          <strong>Duration:</strong> until you delete the record or the organisation.
        </li>
      </ul>
      <p>
        Your team&apos;s accounts and your billing details are not covered here: for those we are the controller, as
        our <Link href="/privacy">Privacy Notice</Link> explains.
      </p>

      <h2>2. Our obligations</h2>
      <p>We will:</p>
      <ol>
        <li>
          process the data only on your documented instructions, which are these terms and how you use Kinga, unless
          the law requires otherwise, in which case we&apos;ll tell you first unless the law forbids it;
        </li>
        <li>
          tell you if we think an instruction breaks the Act;
        </li>
        <li>ensure everyone who can access the data is bound to keep it confidential;</li>
        <li>
          keep appropriate technical and organisational security measures in place, as section 41 requires, including
          encryption in transit, hashed passwords and tokens, access limited to your organisation&apos;s team and
          isolation of each organisation&apos;s records;
        </li>
        <li>
          help you answer data subject requests and carry out impact assessments, mainly through Kinga&apos;s own
          tools for finding, correcting, exporting and deleting records;
        </li>
        <li>
          tell you without delay, and within 48 hours of becoming aware, of a personal data breach affecting your data,
          with what we know about its nature, likely consequences and the measures taken, as section 43(2) requires,
          and help you notify the Data Commissioner and data subjects;
        </li>
        <li>
          give you the information you reasonably need to show you&apos;re meeting your obligations, and cooperate with
          the Data Commissioner; and
        </li>
        <li>delete the data when the agreement ends, as section 5 below describes.</li>
      </ol>

      <h2>3. Sub-processors</h2>
      <p>You authorise us to use these sub-processors:</p>
      <SubprocessorTable />
      <p>
        Each is bound by a contract that protects the data at least as well as this agreement, and we remain
        responsible for them. We&apos;ll email owners at least 30 days before adding or replacing one. If you object on
        reasonable grounds and we can&apos;t address it, you can end the agreement by deleting the organisation, and
        we&apos;ll refund any unused prepaid time.
      </p>

      <h2>4. Transfers outside Kenya</h2>
      <p>
        You instruct us to transfer the data outside Kenya to the sub-processors above, which host Kinga and deliver
        its email. We do so only with appropriate safeguards for its security and protection, as sections 48 to 50
        of the Act require, and will give you proof of them on request.
      </p>

      <h2>5. Return and deletion</h2>
      <p>
        Owners and admins can download all of your records from Settings at any time. When an owner deletes the
        organisation, we delete its records straight away; copies in backups go as the backups are overwritten. We
        keep receipts and eTIMS invoices as tax law requires, which contain no personal data from your records.
      </p>

      <h2>6. Your obligations</h2>
      <p>
        You&apos;re responsible for having a lawful basis for the personal data you record in Kinga, for its accuracy,
        for recording no more than you need, and for your own notifications to the Data Commissioner and data
        subjects.
      </p>

      <h2>7. Precedence</h2>
      <p>If this agreement and the Terms conflict over personal data in your records, this agreement wins.</p>

      <h2>Contact</h2>
      <p>
        Questions about this agreement, or reports of a suspected breach: <Contact email={seller.email} />.
      </p>
    </>
  );
}
