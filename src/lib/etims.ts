// The KRA eTIMS calls invoicing needs, made directly as an Online Sales
// Control Unit (OSCU): set up the device, register what Kinga sells, and send
// each sale to be signed. Follows KRA's "eTIMS OSCU API specification" v2.0.

/** Paths are appended to ETIMS_URL, e.g. https://etims-api-sbx.kra.go.ke/etims-api */
export const SANDBOX_URL = "https://etims-api-sbx.kra.go.ke/etims-api";

/** What `npm run etims:init` hands back, to put in env. */
export interface EtimsDevice {
  cmcKey: string;
  sdcId: string;
  mrcNo: string | null;
  dvcId: string | null;
  taxpayerName: string | null;
  branchName: string | null;
}

export interface EtimsItem {
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  /** In shillings. */
  dftPrc: number;
}

/** What KRA hands back for a signed sale. Printed on the receipt. */
export interface EtimsSignature {
  rcptNo: number;
  totRcptNo: number;
  intrlData: string;
  rcptSign: string;
  sdcDateTime: Date | null;
}

export interface Etims {
  readonly config: EtimsConfig;
  /** Item classifications whose name contains `search` (all of them if empty). */
  itemClasses(search?: string): Promise<{ code: string; name: string }[]>;
  saveItem(item: EtimsItem): Promise<void>;
  saveSale(sale: EtimsSale): Promise<EtimsSignature>;
}

export interface EtimsConfig {
  url: string;
  tin: string;
  bhfId: string;
  cmcKey: string;
  sdcId: string;
  /** Classification sent with each item; see `npm run etims:items -- --classes`. */
  itemClass: string | null;
}

/**
 * KRA answered with a result code other than "000", or couldn't be reached
 * (code null). 994 ("overlapped data") means KRA already has what was sent.
 */
export class EtimsError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "EtimsError";
  }
}

export const ETIMS_DUPLICATE = "994";

/** eTIMS is on only once the device is set up (`npm run etims:init`) and its details are in env. */
export function etimsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EtimsConfig | null {
  const { ETIMS_URL: url, ETIMS_TIN: tin, ETIMS_CMC_KEY: cmcKey, ETIMS_SDC_ID: sdcId } = env;
  if (!url || !tin || !cmcKey || !sdcId) return null;
  return { url: url.replace(/\/+$/, ""), tin, bhfId: env.ETIMS_BHF_ID || "00", cmcKey, sdcId, itemClass: env.ETIMS_ITEM_CLASS || null };
}

export function etimsFromEnv(env: NodeJS.ProcessEnv = process.env): Etims | null {
  const config = etimsConfigFromEnv(env);
  return config ? createEtims(config) : null;
}

async function post(
  fetchImpl: typeof fetch,
  url: string,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetchImpl(`${url}${path}`, {
      method: "POST",
      // The spec puts tin, bhfId and cmcKey in the body; the deployed API reads them from headers.
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new EtimsError(`eTIMS ${path} couldn't be reached: ${err instanceof Error ? err.message : String(err)}`, null);
  }
  const json = (await res.json().catch(() => null)) as { resultCd?: unknown; resultMsg?: unknown; data?: unknown } | null;
  const code = typeof json?.resultCd === "string" ? json.resultCd : null;
  if (code !== "000") {
    const msg = typeof json?.resultMsg === "string" ? json.resultMsg : `HTTP ${res.status}`;
    throw new EtimsError(`eTIMS ${path} failed (${code ?? res.status}): ${msg}`, code);
  }
  return json?.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null;
}

/** Sets the device up and returns its communication key. Run once per device, by `npm run etims:init`. */
export async function initializeDevice(
  p: { url: string; tin: string; bhfId: string; deviceSerial: string },
  fetchImpl: typeof fetch = fetch,
): Promise<EtimsDevice> {
  const url = p.url.replace(/\/+$/, "");
  const data = await post(
    fetchImpl,
    url,
    "/selectInitOsdcInfo",
    { tin: p.tin, bhfId: p.bhfId },
    { tin: p.tin, bhfId: p.bhfId, dvcSrlNo: p.deviceSerial },
    30_000,
  );
  const info = (data?.info ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const cmcKey = str(info.cmcKey);
  const sdcId = str(info.sdcId);
  if (!cmcKey || !sdcId) throw new EtimsError("eTIMS didn't return a communication key and control unit ID.", null);
  return {
    cmcKey,
    sdcId,
    mrcNo: str(info.mrcNo),
    dvcId: str(info.dvcId),
    taxpayerName: str(info.taxprNm),
    branchName: str(info.bhfNm),
  };
}

export function createEtims(config: EtimsConfig, fetchImpl: typeof fetch = fetch, timeoutMs = 15_000): Etims {
  const auth = { tin: config.tin, bhfId: config.bhfId, cmcKey: config.cmcKey };
  const call = (path: string, body: Record<string, unknown>) =>
    post(fetchImpl, config.url, path, auth, { ...auth, ...body }, timeoutMs);

  return {
    config,
    async itemClasses(search = "") {
      const data = await call("/selectItemClsList", { lastReqDt: "20180101000000" });
      const list = Array.isArray(data?.itemClsList) ? (data.itemClsList as Record<string, unknown>[]) : [];
      const needle = search.toLowerCase();
      return list
        .map((c) => ({ code: String(c.itemClsCd ?? ""), name: String(c.itemClsNm ?? "").replace(/\s+/g, " ").trim() }))
        .filter((c) => c.code && c.name.toLowerCase().includes(needle));
    },
    async saveItem(item) {
      await call("/saveItem", {
        itemCd: item.itemCd,
        itemClsCd: item.itemClsCd,
        itemTyCd: ITEM_TYPE_SERVICE,
        itemNm: item.itemNm,
        itemStdNm: null,
        orgnNatCd: "KE",
        pkgUnitCd: PACKAGING_UNIT,
        qtyUnitCd: QUANTITY_UNIT,
        taxTyCd: TAX_TYPE,
        btchNo: null,
        bcd: null,
        dftPrc: item.dftPrc,
        grpPrcL1: item.dftPrc,
        grpPrcL2: item.dftPrc,
        grpPrcL3: item.dftPrc,
        grpPrcL4: item.dftPrc,
        grpPrcL5: null,
        addInfo: null,
        sftyQty: null,
        isrcAplcbYn: "N",
        useYn: "Y",
        ...REGISTERED_BY,
      });
    },
    async saveSale(sale) {
      const data = await call("/saveTrnsSalesOsdc", saleBody(sale));
      const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
      // KRA's own sample has "curRcptNo " with a trailing space; accept either.
      const field = (name: string) => data?.[name] ?? data?.[`${name} `];
      const rcptSign = str(field("rcptSign"));
      const intrlData = str(field("intrlData"));
      if (!rcptSign || !intrlData) throw new EtimsError("eTIMS accepted the sale but returned no signature.", null);
      return {
        rcptNo: Number(str(field("curRcptNo"))) || 0,
        totRcptNo: Number(str(field("totRcptNo"))) || 0,
        intrlData,
        rcptSign,
        sdcDateTime: parseKenyaStamp(str(field("sdcDateTime"))),
      };
    },
  };
}

// Kinga sells services only, and isn't registered for VAT: every line is tax
// type D (Non-VAT), so prices are unchanged and the tax is zero.
const ITEM_TYPE_SERVICE = "3";
const PACKAGING_UNIT = "NT"; // Net
const QUANTITY_UNIT = "U"; // Pieces/item [Number]
const TAX_TYPE = "D";
const REGISTERED_BY = { regrId: "kinga", regrNm: "Kinga", modrId: "kinga", modrNm: "Kinga" };

/** Item code: KE (origin) + 3 (service) + NT (packaging) + U (quantity unit) + a 7-digit number. */
export function etimsItemCode(n: number): string {
  return `KE${ITEM_TYPE_SERVICE}${PACKAGING_UNIT}${QUANTITY_UNIT}${String(n).padStart(7, "0")}`;
}

/**
 * A sale as Kinga makes them: one line, paid in full. Amounts in shillings.
 * With `creditNote`, it's instead a credit note for a refund of that sale,
 * for the amount refunded.
 */
export interface EtimsSale {
  invcNo: number;
  /** Our receipt number, e.g. R-000123, or credit note number, e.g. CN-000004. */
  trdInvcNo: string;
  custTin: string | null;
  custNm: string | null;
  /** Paystack's channel. */
  channel: string | null;
  paidAt: Date;
  item: { itemCd: string; itemClsCd: string | null; itemNm: string };
  amount: number;
  creditNote?: { orgInvcNo: number; refundedAt: Date };
}

/** KRA's credit note reason (spec 4.17) for money given back. */
const CREDIT_NOTE_REASON_REFUND = "06";

/** KRA's payment method codes (spec 4.11). */
export function paymentTypeCode(channel: string | null): string {
  if (channel === "card") return "05";
  if (channel === "mobile_money") return "06";
  return "07";
}

/** A KRA PIN: A or P, nine digits, a letter. */
export function isKraPin(pin: string | null | undefined): pin is string {
  return typeof pin === "string" && /^[AP]\d{9}[A-Z]$/.test(pin);
}

/** The body of /saveTrnsSalesOsdc, field for field as in the spec's sample. A credit note is dated when the refund was made. */
export function saleBody(s: EtimsSale): Record<string, unknown> {
  const cn = s.creditNote;
  const at = kenyaStamp(cn ? cn.refundedAt : s.paidAt);
  const custTin = isKraPin(s.custTin) ? s.custTin : null;
  const amt = Math.round(s.amount * 100) / 100;
  return {
    trdInvcNo: s.trdInvcNo,
    invcNo: s.invcNo,
    orgInvcNo: cn ? cn.orgInvcNo : 0,
    custTin,
    custNm: s.custNm ? s.custNm.slice(0, 60) : null,
    salesTyCd: "N",
    rcptTyCd: cn ? "R" : "S",
    pmtTyCd: paymentTypeCode(s.channel),
    salesSttsCd: "02",
    cfmDt: at,
    salesDt: at.slice(0, 8),
    stockRlsDt: null,
    cnclReqDt: null,
    cnclDt: null,
    rfdDt: cn ? at : null,
    rfdRsnCd: cn ? CREDIT_NOTE_REASON_REFUND : null,
    totItemCnt: 1,
    taxblAmtA: 0,
    taxblAmtB: 0,
    taxblAmtC: 0,
    taxblAmtD: amt,
    taxblAmtE: 0,
    taxRtA: 0,
    taxRtB: 16,
    taxRtC: 0,
    taxRtD: 0,
    taxRtE: 8,
    taxAmtA: 0,
    taxAmtB: 0,
    taxAmtC: 0,
    taxAmtD: 0,
    taxAmtE: 0,
    totTaxblAmt: amt,
    totTaxAmt: 0,
    totAmt: amt,
    prchrAcptcYn: "N",
    remark: null,
    ...REGISTERED_BY,
    receipt: {
      custTin,
      custMblNo: null,
      rcptPbctDt: at,
      trdeNm: null,
      adrs: null,
      topMsg: null,
      btmMsg: null,
      prchrAcptcYn: "N",
    },
    itemList: [
      {
        itemSeq: 1,
        itemCd: s.item.itemCd,
        itemClsCd: s.item.itemClsCd,
        itemNm: s.item.itemNm,
        bcd: null,
        pkgUnitCd: PACKAGING_UNIT,
        pkg: 1,
        qtyUnitCd: QUANTITY_UNIT,
        qty: 1,
        prc: amt,
        splyAmt: amt,
        dcRt: 0,
        dcAmt: 0,
        isrccCd: null,
        isrccNm: null,
        isrcRt: null,
        isrcAmt: null,
        taxTyCd: TAX_TYPE,
        taxblAmt: amt,
        taxAmt: 0,
        totAmt: amt,
      },
    ],
  };
}

/** How a signed invoice is cited: the control unit ID and its receipt number, e.g. KRACU0100000001/42. */
export function formatCuInvoiceNumber(inv: { sdcId: string | null; rcptNo: number | null }): string {
  return `${inv.sdcId}/${inv.rcptNo}`;
}

const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** yyyyMMddHHmmss in Kenya time (UTC+3, no daylight saving), as eTIMS wants dates. */
export function kenyaStamp(d: Date): string {
  return new Date(d.getTime() + KENYA_OFFSET_MS).toISOString().replace(/\D/g, "").slice(0, 14);
}

export function parseKenyaStamp(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi, se) - KENYA_OFFSET_MS;
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * KRA's page for checking an invoice, which the receipt's QR code links to:
 * the PIN, branch and receipt signature run together. The sandbox has its own.
 */
export function etimsVerifyUrl(config: Pick<EtimsConfig, "url">, tin: string, bhfId: string, rcptSign: string): string {
  const host = config.url.includes("-sbx") ? "https://etims-sbx.kra.go.ke" : "https://etims.kra.go.ke";
  return `${host}/common/link/etims/receipt/indexEtimsReceiptData?Data=${encodeURIComponent(tin + bhfId + rcptSign)}`;
}
