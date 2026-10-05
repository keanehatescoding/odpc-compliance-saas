# Kinga: ODPC compliance for Kenyan SMEs

Kinga ("protection" in Swahili; a placeholder name) helps small organisations meet their obligations under the Data Protection Act, 2019:

- **Registration tracker.** Record your ODPC data controller and/or processor certificates. Each one gets a status (not started, application pending, active, renewal due, expiring soon, expired) calculated in Nairobi time, plus the indicative renewal fee for your organisation size.
- **Renewal reminders.** A daily job emails reminders 90, 60, 30, 14, 7 and 1 days before expiry, on the day itself, and 7, 14 and 30 days after. Each reminder is sent once per certificate cycle. Reminders stop once you record a renewal application.
- **Breach response.** Log a personal data breach the moment you learn of it. A live countdown tracks the s.43 deadline: 72 hours to notify the ODPC as a controller, or 48 hours to notify the controller as a processor. The clock stops when you record the notification, or when a controller records why harm is unlikely. You record the risk assessment, affected RoPA activities, containment steps and a dated incident log, then generate draft notifications for the ODPC and for affected people. The team gets an email when a breach is logged, with 24 hours left, and when it becomes overdue.
- **RoPA builder.** A record of processing activities: purpose, s.30 lawful basis, data subjects, categories, sensitive data, cross-border transfers, retention and security. It includes sector templates (schools, clinics, SACCOs, fintech, retail, hospitality), DPIA screening, CSV export and a printable view.
- **Impact assessments.** Full s.31 DPIAs: describe the processing, justify necessity and proportionality, then score each risk before and after mitigation on a likelihood × severity matrix. Start from a flagged RoPA activity, which pre-fills the facts and the matching sector template, or from a template for new processing (CCTV, student and patient records, KYC, credit scoring, marketing, biometric attendance). A DPIA can't be approved while sections are empty or a risk remains high without a recorded ODPC consultation. Approved DPIAs are due for review after 12 months, and each one has a printable report.
- **Data subject requests.** Log requests from people exercising their rights: access, correction, erasure, restriction, objection, portability and opting out of third-party marketing. Each type gets its deadline from the Data Protection (General) Regulations, counted from the day the request arrived: 7 days for access and marketing opt-outs, 14 for correction, erasure, restriction and objection, and 30 for portability. Record who asked, anyone acting for them, how you confirmed their identity, and your response. Declining requires written reasons, and the request page shows what each type allows. The team gets an email 2 days before the deadline and again once it passes, and open requests appear in the dashboard's next steps.
- **Team.** Owners and admins invite colleagues by email from the Team page. The link works for 7 days, only for the invited address, and once. Opening it either creates an account (already confirmed, since the link proves the address) or, for an existing account, asks them to sign in and join. Each account belongs to one organisation. Roles: members work on all the records; admins also change settings and manage admins and members; owners also manage other owners and get the compliance emails. An organisation always keeps at least one owner. Removing someone takes away their access straight away. Invitations can be resent or withdrawn, and each person can send 20 an hour.
- **Account security.** New accounts confirm their email before using the app, because renewal reminders and breach alerts go there. The link is single use, expires in 24 hours, and never signs anyone in. Until it's opened, the user can resend it (5 an hour) or fix a mistyped address, and owners who haven't confirmed get no compliance emails. Password reset by emailed link (single use, expires in 1 hour, signs you out on every device). Signed-in users can change their password in Settings by confirming their current one (10 tries per 15 minutes). This signs out their other devices, cancels any reset links and emails them a notice. Login, signup and reset attempts are rate-limited per IP address, and sign-in attempts per email address (cleared when you sign in), with counters kept in Postgres so every app instance shares them.

See [BRIEF.md](BRIEF.md) for the product brief.

## Stack

Next.js 16 (App Router, server actions), TypeScript, Tailwind 4, Postgres with Drizzle ORM, zod, and vitest (with PGlite for database tests).

## Getting started

```bash
cp .env.example .env
docker compose up -d        # or point DATABASE_URL at any Postgres 14+
npm install
npm run db:migrate
npm run db:seed             # optional demo data
npm run dev
```

Open http://localhost:3000. The seed creates a school, "Sunrise Academy", whose controller certificate expires in 20 days and whose processor certificate expired 17 days ago, an open breach with 42 hours left to notify the ODPC, an approved DPIA for student records, CCTV flagged as needing a DPIA, a parent's access request due in 2 days, a second team member and a pending invitation. Sign in as `demo@kinga.test` / `demo-password-1` (an owner) or `otieno@kinga.test` with the same password (a member).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit and database tests (no running Postgres needed) |
| `npm run typecheck` | `next typegen` + `tsc` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset the demo organisation |
| `npm run reminders` | Run the reminder, breach-alert and request-deadline job once (also prunes stale rate-limit counters, expired reset and verification links, and invitations that expired over 30 days ago) |

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_URL` | yes | Base URL used in email links |
| `CRON_SECRET` | for the cron endpoint | Bearer token for `/api/cron/reminders` |
| `SMTP_URL` | no | Without it, emails are printed to the log |
| `EMAIL_FROM` | no | Sender address |
| `TRUST_IP_HEADER` | no | `x-forwarded-for` (default) or `x-real-ip`. Which header rate limiting reads the client IP from |
| `TRUSTED_PROXY_HOPS` | no | Number of proxies that append to `X-Forwarded-For` (default 1) |

## Scheduling reminders and alerts

Run the job every hour, because breach deadlines are counted in hours. Renewal reminders still go out at most once per threshold. Run it either as a script:

```bash
npm run reminders
```

or over HTTP (for Vercel Cron, GitHub Actions and similar):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/reminders
```

It runs three jobs: renewal reminders, breach alerts, and alerts for data subject requests that are close to or past their response deadline. The endpoint returns `{ reminders, breaches, requests }` with the results of each job. All three are safe to run more than once. Each (certificate, expiry date, threshold) is claimed in `reminder_log`, each (breach, alert stage) in `breach_alert_log`, and each (request, alert stage) in `subject_request_alert_log`, before sending. The claim is released if the send fails. After downtime, each job sends only the most recent missed alert, not every one. Logging a breach or a request also triggers its first alert straight away, and editing a request so that its deadline moves clears its alerts so they are sent again for the new deadline.

## Layout

```
src/lib/          domain logic (dates, registration status, RoPA, reminders, auth)
src/db/           Drizzle schema and client
src/app/actions/  server actions
src/app/(app)/    signed-in pages
src/app/(auth)/   login, signup, password reset, email verification and accepting invitations
scripts/          migrate, seed, reminder job
tests/            vitest
```

Forms work before JavaScript loads (progressive enhancement). Record IDs travel as hidden fields and are always checked against the signed-in organisation.

## Deploying

Run the app behind a reverse proxy. Rate limiting reads the client IP from a header that the proxy sets, so tell the app which header to trust:

- **Default (`TRUST_IP_HEADER=x-forwarded-for`, `TRUSTED_PROXY_HOPS=1`):** the app uses the rightmost `X-Forwarded-For` entry. This fits one proxy that appends the client address, such as Vercel, Caddy's `reverse_proxy`, or nginx with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`.
- **More than one proxy** (for example a CDN in front of nginx): set `TRUSTED_PROXY_HOPS` to the number of proxies that append an entry. With the default of 1, every client would share the CDN's address and one bucket.
- **`TRUST_IP_HEADER=x-real-ip`:** use this only if your proxy overwrites `X-Real-IP` on every request (nginx: `proxy_set_header X-Real-IP $remote_addr`). Caddy and nginx pass a client-supplied `X-Real-IP` through unchanged unless configured to overwrite it, so a client could pick a new address on each request.

If `next start` is exposed directly, clients can send their own `X-Forwarded-For` and dodge the per-IP limits. The per-email login limit still applies.

`APP_URL` must be the public URL, because password reset links are built from it.

## Caveats (verify before launch)

This is an MVP, not legal advice. Check these against current ODPC guidance:

- **Fees** in `src/lib/dpa.ts` are indicative, and the org-size bands have no thresholds attached.
- **24-month certificate validity** is assumed as the default expiry. Users can override it per certificate.
- **KRA PIN format** is validated as `A/P + 9 digits + letter`.
- The **penalty wording** in reminder emails (up to KSh 5M or 1% of turnover).
- **DPIA screening** is a simple heuristic, not the ODPC's official criteria.
- **DPIAs**: the risk matrix and its high/medium/low bands are a heuristic. Treating "high risk after mitigation" as the trigger for s.31 prior consultation, the 12-month review default and the template contents are our reading. Check them against the ODPC's DPIA guidance, including any rule requiring the DPIA to be submitted to the ODPC before processing starts.
- **Data subject request deadlines** in `src/lib/subject-request.ts` are calendar days from receipt, taken from regs. 7–12 and 18 of the Data Protection (General) Regulations, 2021. A deadline falling on a Sunday or public holiday isn't moved to the next working day. The 7-day limit for telling someone you've declined a correction or portability request is shown as guidance rather than tracked, because the Regulations don't say when it starts.
- **Breach rules**: the 72-hour and 48-hour deadlines, the "real risk of harm" test, the exemption from telling affected people when the data was unintelligible, and the particulars in the draft notification are summarised from s.43. Check them, and the ODPC's current submission channel, against the Act and the ODPC's guidance.

## Not built yet

Team invitations and roles UI, and billing.
