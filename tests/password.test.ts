import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    const [, , , , salt, key] = (await hashPassword("pw-1234567")).split("$");
    for (const bad of ["", "scrypt$x$8$1$" + salt + "$" + key, "scrypt$1000$8$1$" + salt + "$" + key, `scrypt$32768$8$1$${salt}$AAAA`]) {
      await expect(verifyPassword("pw-1234567", bad)).resolves.toBe(false);
    }
  });
});
