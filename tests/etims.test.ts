import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { afterPaymentCredited } from "@/lib/after-payment";
import { recordPayment, sendReceipt, type RecordResult } from "@/lib/billing";
import type { EmailMessage } from "@/lib/email";
import {
  createEtims,
  EtimsError,
  etimsVerifyUrl,
  initializeDevice,
  kenyaStamp,
  parseKenyaStamp,
  saleBody,
  type Etims,
  type EtimsConfig,
  type EtimsSale,
} from "@/lib/etims";
import {
  ETIMS_MAX_ATTEMPTS,
  etimsRetryDelay,
  issueEtimsCreditNote,
  issueEtimsInvoice,
  registerEtimsItems,
  runEtimsRetries,
} from "@/lib/etims-invoices";
import { createPaystack, type Paystack, type PaystackRefund } from "@/lib/paystack";
import { recordRefunds, refundsFor } from "@/lib/refunds";
import { TRIAL_DAYS } from "@/lib/plans";

const { etimsInvoices, memberships, organizations, payments, refunds, users } = schema;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const t0 = new Date("2026-10-05T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

const config: EtimsConfig = {
  url: "https://etims-api-sbx.kra.go.ke/etims-api",
  tin: "P000000001A",
  bhfId: "00",
  cmcKey: "secret-key",
  sdcId: "KRACU0100000001",
  itemClass: "8111150000",
};
const signature = { rcptNo: 7, totRcptNo: 7, intrlData: "EAHSAV6ECUUXSY6PCCJYAUP6MI", rcptSign: "QUII27MATATSHFRB", sdcDateTime: later(MINUTE) };

let db: Db;
let orgId: string;

type FakeEtims = Etims & { sales: EtimsSale[]; items: string[] };
function fakeEtims(saveSale: (s: EtimsSale) => Promise<typeof signature> = async () => signature): FakeEtims {
  const sales: EtimsSale[] = [];
  const items: string[] = [];
  return {
    config,
    sales,
    items,
    async itemClasses() {
      return [];
    },
    async saveItem(item) {
      items.push(item.itemCd);
      if (item.itemCd.endsWith("2")) throw new EtimsError("eTIMS /saveItem failed (994): There is an overlapped Data", "994");
    },
    async saveSale(s) {
      sales.push(s);
      return saveSale(s);
    },
  };
}

let refs = 0;
async function creditedPayment(opts: { channel?: string; etims?: boolean } = {}) {
  const reference = `ref-${++refs}`;
  await db.insert(payments).values({ orgId, reference, kind: "subscription", interval: "month", amount: 250_000, currency: "KES" });
  const r = await recordPayment(
    db,
    { reference, status: "success", amount: 250_000, currency: "KES", channel: opts.channel ?? "mobile_money", paidAt: t0 },
    t0,
    opts.etims ?? true,
  );
  if (r.result !== "credited") throw new Error(r.result);
  return { ...r, reference };
}

async function invoiceOf(paymentId: string) {
  const [inv] = await db
    .select()
    .from(etimsInvoices)
    .where(and(eq(etimsInvoices.paymentId, paymentId), isNull(etimsInvoices.refundId)));
  return inv;
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;
  const [o] = await db
    .insert(organizations)
    .values({ name: "Sunrise Academy", sector: "education", size: "medium", kraPin: "P051234567X", trialEndsAt: later(TRIAL_DAYS * DAY) })
    .returning({ id: organizations.id });
  orgId = o.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x", emailVerifiedAt: t0 })
    .returning({ id: users.id });
  await db.insert(memberships).values({ orgId, userId: u.id, role: "owner" });
});

describe("the sale sent to KRA", () => {
  const sale: EtimsSale = {
    invcNo: 12,
    trdInvcNo: "R-000034",
    custTin: "P051234567X",
    custNm: "Sunrise Academy",
    channel: "card",
    paidAt: new Date("2026-10-05T21:30:15Z"),
    item: { itemCd: "KE3NTU0000001", itemClsCd: "8111150000", itemNm: "Kinga subscription, monthly plan" },
    amount: 2500,
  };

  it("has every field of the spec's sample, with the amount untaxed under type D", () => {
    const body = saleBody(sale);
    // Field names from the /saveTrnsSalesOsdc JSON sample (less tin, bhfId and cmcKey, which the client adds).
    const sample =
      "trdInvcNo invcNo orgInvcNo custTin custNm salesTyCd rcptTyCd pmtTyCd salesSttsCd cfmDt salesDt stockRlsDt cnclReqDt cnclDt rfdDt rfdRsnCd totItemCnt taxblAmtA taxblAmtB taxblAmtC taxblAmtD taxblAmtE taxRtA taxRtB taxRtC taxRtD taxRtE taxAmtA taxAmtB taxAmtC taxAmtD taxAmtE totTaxblAmt totTaxAmt totAmt prchrAcptcYn remark regrId regrNm modrId modrNm receipt itemList";
    expect(Object.keys(body).sort()).toEqual(sample.split(" ").sort());
    expect(body).toMatchObject({
      invcNo: 12,
      trdInvcNo: "R-000034",
      custTin: "P051234567X",
      rcptTyCd: "S",
      salesTyCd: "N",
      salesSttsCd: "02",
      pmtTyCd: "05",
      // 21:30 UTC is 00:30 the next day in Nairobi.
      cfmDt: "20261006003015",
      salesDt: "20261006",
      taxblAmtD: 2500,
      totTaxblAmt: 2500,
      totTaxAmt: 0,
      totAmt: 2500,
    });
    const [line] = body.itemList as Record<string, unknown>[];
    expect(line).toMatchObject({ itemSeq: 1, itemCd: "KE3NTU0000001", qty: 1, prc: 2500, taxTyCd: "D", taxblAmt: 2500, taxAmt: 0, totAmt: 2500 });
  });

  it("makes a credit note for a refund: type R, citing the sale, dated when refunded", () => {
    const body = saleBody({
      ...sale,
      invcNo: 15,
      trdInvcNo: "CN-000015",
      amount: 1000,
      creditNote: { orgInvcNo: 12, refundedAt: new Date("2026-10-08T07:00:00Z") },
    });
    expect(body).toMatchObject({
      invcNo: 15,
      orgInvcNo: 12,
      trdInvcNo: "CN-000015",
      rcptTyCd: "R",
      salesTyCd: "N",
      salesSttsCd: "02",
      rfdRsnCd: "06",
      rfdDt: "20261008100000",
      cfmDt: "20261008100000",
      salesDt: "20261008",
      taxblAmtD: 1000,
      totAmt: 1000,
    });
    expect((body.itemList as Record<string, unknown>[])[0]).toMatchObject({ prc: 1000, totAmt: 1000, taxTyCd: "D" });
    // A sale cites no invoice.
    expect(saleBody(sale)).toMatchObject({ orgInvcNo: 0, rfdDt: null, rfdRsnCd: null });
  });

  it("names mobile money and leaves out a PIN that isn't one", () => {
    const body = saleBody({ ...sale, channel: "mobile_money", custTin: "not a pin" });
    expect(body.pmtTyCd).toBe("06");
    expect(body.custTin).toBeNull();
    expect((body.receipt as Record<string, unknown>).custTin).toBeNull();
    expect(saleBody({ ...sale, channel: "bank_transfer" }).pmtTyCd).toBe("07");
  });

  it("reads and writes KRA's dates in Kenya time", () => {
    expect(kenyaStamp(new Date("2026-01-01T00:00:00Z"))).toBe("20260101030000");
    expect(parseKenyaStamp("20260101030000")).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(parseKenyaStamp("")).toBeNull();
  });

  it("links the QR code to KRA's check for the right environment", () => {
    expect(etimsVerifyUrl(config, "P000000001A", "00", "QUII27MATATSHFRB")).toBe(
      "https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=P000000001A00QUII27MATATSHFRB",
    );
    expect(etimsVerifyUrl({ url: "https://etims-api.kra.go.ke/etims-api" }, "P000000001A", "00", "X")).toMatch(/^https:\/\/etims\.kra\.go\.ke\//);
  });
});

describe("the eTIMS client", () => {
  function fakeFetch(reply: unknown, status = 200) {
    const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify(reply), { status });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it("sends the PIN, branch and key as headers and in the body, and reads the signature", async () => {
    const f = fakeFetch({
      resultCd: "000",
      resultMsg: "It is succeeded",
      // As in KRA's sample, with stray spaces in two keys.
      data: { "curRcptNo ": "1", "totRcptNo ": "1", intrlData: "EAHSAV6ECUUXSY6PCCJYAUP6MI", rcptSign: "QUII27MATATSHFRB", sdcDateTime: "20210502115145" },
    });
    const etims = createEtims(config, f.impl);
    const sig = await etims.saveSale({
      invcNo: 1,
      trdInvcNo: "R-000001",
      custTin: null,
      custNm: "Sunrise Academy",
      channel: "card",
      paidAt: t0,
      item: { itemCd: "KE3NTU0000001", itemClsCd: null, itemNm: "x" },
      amount: 10,
    });
    expect(sig).toEqual({
      rcptNo: 1,
      totRcptNo: 1,
      intrlData: "EAHSAV6ECUUXSY6PCCJYAUP6MI",
      rcptSign: "QUII27MATATSHFRB",
      sdcDateTime: new Date("2021-05-02T08:51:45Z"),
    });
    expect(f.calls[0].url).toBe(`${config.url}/saveTrnsSalesOsdc`);
    expect(f.calls[0].headers).toMatchObject({ tin: config.tin, bhfId: "00", cmcKey: "secret-key" });
    expect(f.calls[0].body).toMatchObject({ tin: config.tin, bhfId: "00", cmcKey: "secret-key", invcNo: 1 });
  });

  it("throws KRA's result code when it isn't 000, and no code when KRA can't be reached", async () => {
    const etims = createEtims(config, fakeFetch({ resultCd: "994", resultMsg: "There is an overlapped Data" }).impl);
    await expect(etims.saveItem({ itemCd: "KE3NTU0000001", itemClsCd: "1", itemNm: "x", dftPrc: 1 })).rejects.toMatchObject({
      name: "EtimsError",
      code: "994",
    });
    const offline = createEtims(config, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    await expect(offline.saveItem({ itemCd: "KE3NTU0000001", itemClsCd: "1", itemNm: "x", dftPrc: 1 })).rejects.toMatchObject({ code: null });
  });

  it("sets the device up and returns its key", async () => {
    const f = fakeFetch({ resultCd: "000", data: { info: { cmcKey: "KEY", sdcId: "KRACU0100000001", mrcNo: "WIS01000001", taxprNm: "Kinga Ltd" } } });
    const device = await initializeDevice({ url: `${config.url}/`, tin: config.tin, bhfId: "00", deviceSerial: "dvc123" }, f.impl);
    expect(device).toMatchObject({ cmcKey: "KEY", sdcId: "KRACU0100000001", mrcNo: "WIS01000001", taxpayerName: "Kinga Ltd" });
    expect(f.calls[0]).toMatchObject({ url: `${config.url}/selectInitOsdcInfo`, body: { tin: config.tin, bhfId: "00", dvcSrlNo: "dvc123" } });
  });
});

describe("items", () => {
  it("registers each thing Kinga sells as a service item, carrying on past ones KRA already has", async () => {
    const etims = fakeEtims();
    const done = await registerEtimsItems(etims);
    expect(etims.items).toEqual(["KE3NTU0000001", "KE3NTU0000002", "KE3NTU0000003", "KE3NTU0000004"]);
    expect(done.map((d) => d.added)).toEqual([true, false, true, true]);
    expect(done[2].itemNm).toBe("Kinga expert DPIA review");
  });
});

describe("invoices", () => {
  it("creates a pending invoice when a payment is credited, numbered in order, only when eTIMS is on", async () => {
    const a = await creditedPayment();
    const b = await creditedPayment();
    const off = await creditedPayment({ etims: false });
    expect(await invoiceOf(a.paymentId)).toMatchObject({ status: "pending", invcNo: 1, attempts: 0 });
    expect((await invoiceOf(b.paymentId)).invcNo).toBe(2);
    expect(await invoiceOf(off.paymentId)).toBeUndefined();
  });

  it("signs the invoice and stores what KRA returned", async () => {
    const p = await creditedPayment({ channel: "card" });
    const etims = fakeEtims();
    expect(await issueEtimsInvoice(db, etims, p.paymentId, t0)).toEqual({ result: "signed" });
    expect(etims.sales[0]).toMatchObject({
      invcNo: 1,
      trdInvcNo: "R-000001",
      custTin: "P051234567X",
      custNm: "Sunrise Academy",
      channel: "card",
      amount: 2500,
      item: { itemCd: "KE3NTU0000001", itemClsCd: "8111150000", itemNm: "Kinga subscription, monthly plan" },
    });
    expect(await invoiceOf(p.paymentId)).toMatchObject({
      status: "signed",
      attempts: 1,
      tin: config.tin,
      bhfId: "00",
      sdcId: config.sdcId,
      ...signature,
      signedAt: t0,
      lastError: null,
    });
    // Signed invoices aren't sent again.
    expect(await issueEtimsInvoice(db, etims, p.paymentId, later(DAY))).toEqual({ result: "skipped" });
    expect(etims.sales).toHaveLength(1);
  });

  it("puts the signed invoice on the receipt email", async () => {
    const p = await creditedPayment();
    const sent: EmailMessage[] = [];
    await afterPaymentCredited(db, async (m) => void sent.push(m), p as Extract<RecordResult, { result: "credited" }>, fakeEtims());
    expect(sent[0].text).toContain(`KRA eTIMS invoice: ${config.sdcId}/7`);
    expect(sent[0].text).toContain("Receipt signature: QUII27MATATSHFRB");
  });

  it("says the invoice is on its way when KRA hasn't signed it yet", async () => {
    const p = await creditedPayment();
    const sent: EmailMessage[] = [];
    const down = fakeEtims(async () => {
      throw new EtimsError("eTIMS /saveTrnsSalesOsdc couldn't be reached: timeout", null);
    });
    await afterPaymentCredited(db, async (m) => void sent.push(m), p as Extract<RecordResult, { result: "credited" }>, down);
    expect(sent[0].text).toContain("KRA eTIMS invoice: being issued");
  });

  it("retries a failed send later with the same invoice number, backing off", async () => {
    const p = await creditedPayment();
    let fail = true;
    const etims = fakeEtims(async () => {
      if (fail) throw new EtimsError("eTIMS /saveTrnsSalesOsdc failed (999): unknown error", "999");
      return signature;
    });
    expect(await issueEtimsInvoice(db, etims, p.paymentId, t0)).toMatchObject({ result: "retrying" });
    const inv = await invoiceOf(p.paymentId);
    expect(inv).toMatchObject({ status: "pending", attempts: 1, lastError: expect.stringContaining("999") });
    expect(inv.nextAttemptAt).toEqual(later(etimsRetryDelay(1)));

    // Not due yet.
    expect(await runEtimsRetries(db, etims, { now: later(etimsRetryDelay(1) - 1) })).toEqual({ checked: 0, signed: [], retrying: [], failed: [] });
    fail = false;
    expect(await runEtimsRetries(db, etims, { now: later(etimsRetryDelay(1)) })).toMatchObject({ checked: 1, signed: [p.paymentId] });
    expect(etims.sales.map((s) => s.invcNo)).toEqual([1, 1]);
    expect(await invoiceOf(p.paymentId)).toMatchObject({ status: "signed", attempts: 2 });
  });

  it("doesn't let two senders send the same invoice at once", async () => {
    const p = await creditedPayment();
    let release!: () => void;
    const etims = fakeEtims(() => new Promise((resolve) => (release = () => resolve(signature))));
    const first = issueEtimsInvoice(db, etims, p.paymentId, t0);
    await expect.poll(() => etims.sales.length).toBe(1);
    expect(await issueEtimsInvoice(db, etims, p.paymentId, t0)).toEqual({ result: "skipped" });
    release();
    expect(await first).toEqual({ result: "signed" });
  });

  it("gives up after the last attempt", async () => {
    const p = await creditedPayment();
    await db.update(etimsInvoices).set({ attempts: ETIMS_MAX_ATTEMPTS - 1 }).where(eq(etimsInvoices.paymentId, p.paymentId));
    const etims = fakeEtims(async () => {
      throw new EtimsError("eTIMS /saveTrnsSalesOsdc failed (910): Request parameter error", "910");
    });
    const run = await runEtimsRetries(db, etims, { now: t0 });
    expect(run.failed).toEqual([{ paymentId: p.paymentId, error: expect.stringContaining("910") }]);
    expect(await invoiceOf(p.paymentId)).toMatchObject({ status: "failed", attempts: ETIMS_MAX_ATTEMPTS });
  });

  it("doesn't throw if the database fails before the invoice is claimed", async () => {
    const p = await creditedPayment();
    const etims = fakeEtims();
    const broken = { update: () => { throw new Error("connection terminated"); } } as unknown as Db;
    expect(await issueEtimsInvoice(broken, etims, p.paymentId, t0)).toEqual({ result: "retrying", error: "connection terminated" });
    expect(etims.sales).toEqual([]);
    // Nothing was claimed, so the next run sends it.
    expect(await invoiceOf(p.paymentId)).toMatchObject({ status: "pending", attempts: 0 });
    expect(await runEtimsRetries(db, etims, { now: t0 })).toMatchObject({ signed: [p.paymentId] });
  });

  it("stops at once when KRA already has the invoice number", async () => {
    const p = await creditedPayment();
    const etims = fakeEtims(async () => {
      throw new EtimsError("eTIMS /saveTrnsSalesOsdc failed (994): There is an overlapped Data", "994");
    });
    expect(await issueEtimsInvoice(db, etims, p.paymentId, t0)).toMatchObject({ result: "failed" });
    expect(await invoiceOf(p.paymentId)).toMatchObject({ status: "failed", lastError: expect.stringContaining("KRA already has invoice 1") });
  });
});

describe("Paystack refunds", () => {
  it("looks the transaction's ID up, then lists its refunds", async () => {
    const urls: string[] = [];
    const impl = (async (url: string) => {
      urls.push(url);
      const data = url.includes("/transaction/verify/")
        ? { id: 4099, reference: "ref-1", status: "success" }
        : [
            { id: 11, transaction: 4099, amount: 100_000, currency: "KES", status: "processed", refunded_at: "2026-10-08T07:00:00.000Z" },
            { id: 12, transaction: { id: 4099 }, amount: 50_000, currency: "KES", status: "pending", refunded_at: null },
            { id: 13, transaction: 5000, amount: 1, currency: "KES", status: "processed" },
          ];
      return new Response(JSON.stringify({ status: true, message: "ok", data }));
    }) as unknown as typeof fetch;
    const list = await createPaystack("sk_test_x", impl).refunds("ref-1");
    expect(urls).toEqual(["https://api.paystack.co/transaction/verify/ref-1", "https://api.paystack.co/refund?transaction=4099&perPage=100"]);
    expect(list).toEqual([
      { id: "11", status: "processed", amount: 100_000, currency: "KES", refundedAt: new Date("2026-10-08T07:00:00Z") },
      { id: "12", status: "pending", amount: 50_000, currency: "KES", refundedAt: null },
    ]);
  });
});

describe("credit notes", () => {
  const refundedAt = later(2 * DAY);
  function fakePaystack(list: PaystackRefund[]): Paystack & { list: PaystackRefund[] } {
    const notUsed = async () => {
      throw new Error("not used");
    };
    const p = {
      list,
      initialize: notUsed,
      verify: notUsed,
      chargeAuthorization: notUsed,
      deactivateAuthorization: notUsed,
      async refunds() {
        return p.list;
      },
    };
    return p;
  }
  const processed = (id: string, amount: number): PaystackRefund => ({ id, status: "processed", amount, currency: "KES", refundedAt });

  async function creditNotes(paymentId: string) {
    return (await refundsFor(db, paymentId)).map((r) => r.creditNote);
  }

  it("records each processed refund once and sends its credit note, citing the signed sale", async () => {
    const p = await creditedPayment({ channel: "card" });
    const etims = fakeEtims();
    await issueEtimsInvoice(db, etims, p.paymentId, t0);
    const paystack = fakePaystack([processed("11", 100_000), { ...processed("12", 50_000), status: "pending" }]);

    const first = await recordRefunds(db, paystack, p.reference, etims, refundedAt);
    expect(first).toMatchObject({ result: "recorded", paymentId: p.paymentId, refundIds: [expect.any(String)] });
    expect(etims.sales[1]).toMatchObject({
      invcNo: 2,
      trdInvcNo: "CN-000002",
      amount: 1000,
      custTin: "P051234567X",
      channel: "card",
      item: { itemCd: "KE3NTU0000001" },
      creditNote: { orgInvcNo: 1, refundedAt },
    });
    expect(await creditNotes(p.paymentId)).toEqual([expect.objectContaining({ status: "signed", invcNo: 2, ...signature })]);

    // Delivered again, and once the pending refund has gone through.
    paystack.list = [processed("11", 100_000), processed("12", 50_000)];
    const again = await recordRefunds(db, paystack, p.reference, etims, later(3 * DAY));
    expect(again.result === "recorded" && again.refundIds).toHaveLength(1);
    expect(etims.sales.map((s) => [s.invcNo, s.creditNote?.orgInvcNo, s.amount])).toEqual([
      [1, undefined, 2500],
      [2, 1, 1000],
      [3, 1, 500],
    ]);
    expect(await db.select().from(refunds)).toHaveLength(2);
    // The sale is still the payment's invoice.
    expect(await invoiceOf(p.paymentId)).toMatchObject({ invcNo: 1 });
  });

  it("holds a credit note until its sale is signed, then the hourly job sends it", async () => {
    const p = await creditedPayment();
    let up = false;
    const etims = fakeEtims(async () => {
      if (!up) throw new EtimsError("eTIMS /saveTrnsSalesOsdc couldn't be reached: timeout", null);
      return signature;
    });
    await issueEtimsInvoice(db, etims, p.paymentId, t0);
    const r = await recordRefunds(db, fakePaystack([processed("11", 250_000)]), p.reference, etims, refundedAt);
    const [refundId] = r.result === "recorded" ? r.refundIds : [];
    // Only the sale was tried: the credit note waits, without using up attempts.
    expect(etims.sales.map((s) => s.invcNo)).toEqual([1]);
    expect(await creditNotes(p.paymentId)).toEqual([expect.objectContaining({ status: "pending", attempts: 0 })]);
    expect(await issueEtimsCreditNote(db, etims, refundId, refundedAt)).toEqual({ result: "skipped" });

    up = true;
    const run = await runEtimsRetries(db, etims, { now: later(3 * DAY) });
    // The sale first, which lets the credit note go in the next run.
    expect(run).toMatchObject({ checked: 1, signed: [p.paymentId] });
    expect(await runEtimsRetries(db, etims, { now: later(3 * DAY) })).toMatchObject({ checked: 1, signed: [p.paymentId] });
    expect(etims.sales.map((s) => [s.invcNo, s.creditNote?.orgInvcNo])).toEqual([
      [1, undefined],
      [1, undefined],
      [2, 1],
    ]);
  });

  it("records a refund of a payment made before eTIMS without a credit note", async () => {
    const p = await creditedPayment({ etims: false });
    const etims = fakeEtims();
    const r = await recordRefunds(db, fakePaystack([processed("11", 250_000)]), p.reference, etims, refundedAt);
    expect(r).toMatchObject({ result: "recorded", refundIds: [expect.any(String)] });
    expect(await creditNotes(p.paymentId)).toEqual([null]);
    expect(etims.sales).toEqual([]);
  });

  it("ignores references that aren't paid Kinga payments", async () => {
    await db.insert(payments).values({ orgId, reference: "unpaid", kind: "subscription", interval: "month", amount: 250_000, currency: "KES" });
    const paystack = fakePaystack([processed("11", 250_000)]);
    expect(await recordRefunds(db, paystack, "unpaid", null)).toEqual({ result: "unknown" });
    expect(await recordRefunds(db, paystack, "dashboard-charge", null)).toEqual({ result: "unknown" });
    expect(await db.select().from(refunds)).toEqual([]);
  });

  it("keeps the receipt email on the sale's invoice once there are credit notes", async () => {
    const p = await creditedPayment();
    const etims = fakeEtims();
    await issueEtimsInvoice(db, etims, p.paymentId, t0);
    await recordRefunds(db, fakePaystack([processed("11", 100_000)]), p.reference, etims, refundedAt);
    const sent: EmailMessage[] = [];
    await sendReceipt(db, async (m) => void sent.push(m), p.paymentId);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(`KRA eTIMS invoice: ${config.sdcId}/7`);
  });
});
