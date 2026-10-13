import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
} from "railway/iac";

// Infrastructure as Code for the `kinga` production environment. This repository
// holds every service in it, so this file owns the project rather than a named
// partial. Railway doesn't read this file while deploying: apply it with
// `railway config apply`.
//
// This replaces `railway.json`, which Railway no longer reads for this service.
// Config as Code is only honoured for legacy services, so the file was silently
// ignored: the service deployed with no pre-deploy command, no health check and
// an auto-detected start command. Railway stopped reading it entirely on
// 2026-12-01 regardless.
//
// Secrets are deliberately absent. They're set on Railway itself, with
// `railway variables --set ...`, and declared as preserve() below so an apply
// keeps the stored value instead of deleting it or overwriting it with
// something committed here.

export default defineRailway(() => {
  const db = postgres("Postgres");

  const app = service("odpc-compliance-saas", {
    source: github("keanehatescoding/odpc-compliance-saas", {
      branch: "master",
    }),
    build: { builder: "RAILPACK" },
    start: "npm start",
    preDeploy: "npm run db:migrate",
    // Asks Postgres as well as the app, so a wrong DATABASE_URL fails the
    // deploy rather than going live and 500ing on every request.
    healthcheck: "/api/health",
    variables: {
      // Railway's private network, where no TLS is needed. The pool sets no
      // `ssl` option, so pointing this at Postgres's public proxy instead needs
      // `?sslmode=require` in the URL.
      DATABASE_URL: db.env.DATABASE_URL,
      // Railway's edge rewrites X-Forwarded-For to [client, its own hop], so the
      // default rightmost-entry rule would rate-limit every visitor as one IP,
      // putting the whole company in a single bucket. X-Real-IP is overwritten
      // at the same point, so it holds the client and can't be forged. See
      // "Deploying" in README.md.
      TRUST_IP_HEADER: "x-real-ip",
      // Secrets and demo settings, set on Railway and never committed.
      APP_URL: preserve(),
      CRON_SECRET: preserve(),
      // Remove this once SMTP_URL is set, or the app refuses to start: it
      // would rather fail loudly than go live without sending breach alerts.
      EMAIL_LOG_ONLY: preserve(),
      SMTP_URL: preserve(),
      PAYSTACK_SECRET_KEY: preserve(),
      SELLER_NAME: preserve(),
      SELLER_KRA_PIN: preserve(),
      SELLER_ADDRESS: preserve(),
      SELLER_EMAIL: preserve(),
    },
  });

  return project("kinga", { resources: [app, db] });
});