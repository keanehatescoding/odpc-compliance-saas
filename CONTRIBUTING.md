# Contributing to Kinga

Thanks for helping improve Kinga, ODPC compliance for Kenyan SMEs. This guide covers how to set up the project, what we expect from a change, and the areas that need extra care.

## Ground rules

- Kinga handles compliance deadlines, breach notifications, billing and personal data. A small mistake can have real legal or financial consequences for users, so accuracy matters more than speed.
- Keep changes focused. One pull request should do one thing.
- This is an MVP and not legal advice. Anything that encodes a legal rule must be traceable to the Data Protection Act, 2019 or its Regulations (see [Legal and domain changes](#legal-and-domain-changes)).

## Getting started

Prerequisites: Node.js, npm, and Postgres 14+ (Docker is the easiest way).

```bash
git clone git@github.com:keanehatescoding/odpc-compliance-saas.git
cd odpc-compliance-saas
cp .env.example .env
docker compose up -d        # or point DATABASE_URL at any Postgres 14+
npm install
npm run db:migrate
npm run db:seed             # optional demo data
npm run dev
```

Open <http://localhost:3000>. The seed creates a demo school organisation. Sign in as `demo@kinga.test` / `demo-password-1` (owner) or `otieno@kinga.test` with the same password (member).

Locally, emails are printed to the log when `SMTP_URL` isn't set, so you don't need an SMTP server.

## Project layout

```
src/lib/          domain logic (dates, registration status, RoPA, reminders, auth)
src/db/           Drizzle schema and client
src/app/actions/  server actions
src/app/(app)/    signed-in pages
src/app/(auth)/   login, signup, password reset, email verification, invitations
src/app/(legal)/  Terms, Privacy Notice and Data Processing Agreement
scripts/          migrate, seed, reminder job, service orders, refunds, eTIMS setup
tests/            vitest
```

Put business rules in `src/lib/` as pure, testable functions. Keep server actions thin.

## Development workflow

1. Create a branch from `master` (for example `feat/short-description` or `fix/short-description`).
2. Make your change and add or update tests.
3. Run the checks below until they pass.
4. Open a pull request against `master` describing what changed and why.

### Checks to run before opening a PR

```bash
npm test              # unit and database tests (no running Postgres needed)
npm run typecheck     # next typegen + tsc
npm run lint          # ESLint
```

Tests use vitest with PGlite, so database tests run in-process.

## Database changes

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate` to create a migration.
3. Commit the generated files in `drizzle/` with your schema change.
4. Run `npm run db:migrate` locally and check the app still works.

Never edit a migration that has already been merged. Add a new one instead. Think about existing production data: if a migration changes behaviour for current organisations (as the billing migration's trial period did), say so in the PR.

## Code expectations

- **TypeScript, strictly typed.** Validate external input with zod.
- **Always scope by organisation.** Record IDs travel as hidden form fields and must be checked against the signed-in organisation on the server. Never trust an ID from the client.
- **Progressive enhancement.** Forms should work before JavaScript loads.
- **Dates are in Nairobi time** for status and deadline calculations. Use the helpers in `src/lib/` rather than ad hoc date maths.
- **Idempotent jobs.** The reminder, alert, renewal, billing and eTIMS jobs can run more than once. Claim an action in its log table before sending or charging, and release the claim if the send fails.
- **No secrets in the repo.** Use `.env` locally (it's gitignored) and add new variables to `.env.example` and the README's Environment table.
- **Third-party origins.** `next.config.ts` sets a strict Content Security Policy. Allow a new origin there before relying on it, and explain why in your PR.

## Legal and domain changes

Changes to deadlines, fees, breach rules, DPIA logic, data subject request timings or the legal pages need extra care:

- Cite the section or regulation you're relying on (for example s.43 for breach notification, s.31 for DPIAs) in the code comment and the PR description.
- If you're unsure of the rule, don't guess. Add it to the README's "Caveats (verify before launch)" list instead.
- Update the tests that encode the deadline or rule.
- Bump `TERMS_VERSION` if the Terms or DPA change in substance, and update `SUBPROCESSORS` in `src/lib/legal.ts` when providers change.

## Payments, billing and eTIMS

- Use Paystack **test keys** (`sk_test_…`) and the KRA eTIMS **sandbox** only. Never commit or paste live credentials.
- Payments and renewal charges must stay idempotent. Each charge is claimed in the database before it is made.
- Don't start `npm run reminders` by hand while the scheduled job is running, because overlapping runs each hold a database connection.

## Commit messages and pull requests

- Write commit messages in the imperative mood ("Add DPIA review reminder", not "Added…").
- In the PR description, explain what changed, why, how you tested it, and anything reviewers should check, such as migrations, new env vars or legal rules.
- Include screenshots for visible UI changes.
- Keep PRs small enough to review in one sitting.

## Reporting bugs and security issues

- For ordinary bugs, open a GitHub issue with steps to reproduce, what you expected, and what happened.
- For **security vulnerabilities**, do not open a public issue. Contact the maintainer privately at `<security contact email>` (or use GitHub's private vulnerability reporting if it's enabled for the repo).
- Never include real personal data, breach details or credentials in an issue or PR.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
