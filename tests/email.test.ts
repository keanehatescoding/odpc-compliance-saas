import { describe, expect, it } from "vitest";
import { assertEmailConfigured, createEmailSender } from "@/lib/email";

describe("email configuration", () => {
  it("logs emails in development without SMTP", () => {
    expect(() => assertEmailConfigured({ NODE_ENV: "development" })).not.toThrow();
    expect(createEmailSender({ NODE_ENV: "development" })).toBeTypeOf("function");
  });

  it("refuses to run in production without SMTP", () => {
    expect(() => assertEmailConfigured({ NODE_ENV: "production" })).toThrow(/SMTP_URL/);
    expect(() => createEmailSender({ NODE_ENV: "production" })).toThrow(/SMTP_URL/);
  });

  it("allows log-only email in production when asked", () => {
    expect(() => assertEmailConfigured({ NODE_ENV: "production", EMAIL_LOG_ONLY: "true" })).not.toThrow();
  });

  it("accepts SMTP in production", () => {
    expect(() => assertEmailConfigured({ NODE_ENV: "production", SMTP_URL: "smtp://localhost:25" })).not.toThrow();
  });
});
