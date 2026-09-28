# Kinga: ODPC compliance for Kenyan SMEs

Kinga ("protection" in Swahili; a placeholder name) helps small organisations meet their obligations under the Data Protection Act, 2019:

- **Registration tracker.** Record your ODPC data controller and/or processor certificates. Each one gets a status (not started, application pending, active, renewal due, expiring soon, expired) calculated in Nairobi time, plus the indicative renewal fee for your organisation size.
- **Renewal reminders.** A daily job emails reminders 90, 60, 30, 14, 7 and 1 days before expiry, on the day itself, and 7, 14 and 30 days after. Each reminder is sent once per certificate cycle. Reminders stop once you record a renewal application.
- **RoPA builder.** A record of processing activities: purpose, s.30 lawful basis, data subjects, categories, sensitive data, cross-border transfers, retention and security. It includes sector templates (schools, clinics, SACCOs, fintech, retail, hospitality), DPIA screening, CSV export and a printable view.

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

Open http://localhost:3000. The seed creates a school, "Sunrise Academy", whose controller certificate expires in 20 days and whose processor certificate expired 17 days ago. Sign in as `demo@kinga.test` / `demo-password-1`.

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
| `npm run reminders` | Run the reminder job once |

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_URL` | yes | Base URL used in email links |
| `CRON_SECRET` | for the cron endpoint | Bearer token for `/api/cron/reminders` |
| `SMTP_URL` | no | Without it, emails are printed to the log |
| `EMAIL_FROM` | no | Sender address |

## Scheduling reminders

Run the job once a day, either as a script:

```bash
npm run reminders
```

or over HTTP (for Vercel Cron, GitHub Actions and similar):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/reminders
```

The job is safe to run more than once. Each (certificate, expiry date, threshold) is claimed in `reminder_log` before sending and released if the send fails. After downtime it sends only the most recent missed reminder, not every one.

## Layout

```
src/lib/          domain logic (dates, registration status, RoPA, reminders, auth)
src/db/           Drizzle schema and client
src/app/actions/  server actions
src/app/(app)/    signed-in pages
src/app/(auth)/   login and signup
scripts/          migrate, seed, reminder job
tests/            vitest
```

Forms work before JavaScript loads (progressive enhancement). Record IDs travel as hidden fields and are always checked against the signed-in organisation.

## Caveats (verify before launch)

This is an MVP, not legal advice. Check these against current ODPC guidance:

- **Fees** in `src/lib/dpa.ts` are indicative, and the org-size bands have no thresholds attached.
- **24-month certificate validity** is assumed as the default expiry. Users can override it per certificate.
- **KRA PIN format** is validated as `A/P + 9 digits + letter`.
- The **penalty wording** in reminder emails (up to KSh 5M or 1% of turnover).
- **DPIA screening** is a simple heuristic, not the ODPC's official criteria.

## Not built yet

Team invitations and roles UI, breach notification (72-hour) workflow, DPIA templates, data-subject request tracking, rate limiting on login and signup, password reset, and billing.
