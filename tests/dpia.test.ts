import { describe, expect, it } from "vitest";
import { SECTOR_KEYS } from "@/lib/dpa";
import {
  approvalBlockers,
  consultationRequired,
  DPIA_TEMPLATES,
  dpiaStatus,
  dpiaTemplatesForSector,
  draftDpia,
  getDpiaTemplate,
  highestLevel,
  RISK_FIELDS,
  riskErrorKey,
  riskLevel,
  type RiskInput,
} from "@/lib/dpia";
import { parseDpiaForm } from "@/lib/dpia-form";
import { ACTIVITY_TEMPLATES, type ActivityInput } from "@/lib/ropa";

const mitigated: RiskInput = {
  description: "Staff snoop on records",
  likelihood: "probable",
  severity: "severe",
  mitigation: "Audit trail reviewed monthly",
  residualLikelihood: "remote",
  residualSeverity: "significant",
};

function form(entries: Record<string, string | string[]>, risks: Partial<RiskInput>[] = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const x of [v].flat()) fd.append(k, x);
  for (const r of risks) {
    const row = { ...mitigated, ...r };
    for (const [k, name] of Object.entries(RISK_FIELDS)) fd.append(name, row[k as keyof RiskInput]);
  }
  return fd;
}

const approvable = {
  title: "Patient records",
  description: "EMR for all patients",
  necessity: "Needed for care",
  approvedBy: "Dr Achieng, Medical Director",
};

describe("risk scoring", () => {
  it("multiplies likelihood by severity on a 3×3 grid", () => {
    expect(riskLevel("remote", "minimal")).toBe("low");
    expect(riskLevel("remote", "significant")).toBe("low");
    expect(riskLevel("possible", "significant")).toBe("medium");
    expect(riskLevel("remote", "severe")).toBe("medium");
    expect(riskLevel("possible", "severe")).toBe("high");
    expect(riskLevel("probable", "severe")).toBe("high");
  });

  it("summarises by the highest level", () => {
    expect(highestLevel([])).toBeNull();
    expect(highestLevel(["low", "high", "medium"])).toBe("high");
    expect(highestLevel(["low", "medium"])).toBe("medium");
  });

  it("requires ODPC consultation only when high risk remains after mitigation", () => {
    expect(consultationRequired([mitigated])).toBe(false);
    expect(consultationRequired([{ ...mitigated, residualLikelihood: "possible", residualSeverity: "severe" }])).toBe(true);
  });
});

describe("dpiaStatus", () => {
  it("is a draft until approved, then due for review on the review date", () => {
    expect(dpiaStatus({ approvedOn: null, reviewOn: null }, "2026-10-03")).toBe("draft");
    expect(dpiaStatus({ approvedOn: "2026-01-10", reviewOn: "2027-01-10" }, "2026-10-03")).toBe("approved");
    expect(dpiaStatus({ approvedOn: "2025-10-03", reviewOn: "2026-10-03" }, "2026-10-03")).toBe("review_due");
  });
});

describe("approvalBlockers", () => {
  const base = { ...approvable, odpcConsultedOn: null, risks: [mitigated] };

  it("is empty for a complete DPIA", () => {
    expect(approvalBlockers(base)).toEqual([]);
  });

  it("lists each missing piece", () => {
    expect(approvalBlockers({ ...base, description: " ", necessity: "", approvedBy: "", risks: [] })).toHaveLength(4);
    expect(approvalBlockers({ ...base, risks: [{ ...mitigated, mitigation: "" }] })).toEqual([
      "Record the measures that address each risk.",
    ]);
  });

  it("blocks approval with high residual risk until the ODPC is consulted", () => {
    const high = { ...mitigated, residualLikelihood: "probable", residualSeverity: "severe" } as const;
    expect(approvalBlockers({ ...base, risks: [high] })[0]).toMatch(/Consult the ODPC/);
    expect(approvalBlockers({ ...base, risks: [high], odpcConsultedOn: "2026-09-01" })).toEqual([]);
  });
});

describe("parseDpiaForm", () => {
  it("keeps filled risk rows in order and drops blank spare rows", () => {
    const r = parseDpiaForm(
      form({ title: "Patient records" }, [
        { description: "First" },
        { description: "", mitigation: "" },
        { description: "Second", likelihood: "remote" },
      ]),
    );
    expect(r.success).toBe(true);
    expect(r.data!.risks.map((x) => [x.description, x.likelihood])).toEqual([
      ["First", "probable"],
      ["Second", "remote"],
    ]);
  });

  it("flags measures entered without a risk, against that row", () => {
    const r = parseDpiaForm(form({ title: "Patient records" }, [{ description: "First" }, { description: "", mitigation: "Locks" }]));
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toEqual([riskErrorKey(1)]);
  });

  it("saves a draft with nothing but a title", () => {
    const r = parseDpiaForm(form({ title: "CCTV" }));
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ approvedOn: null, reviewOn: null, risks: [] });
  });

  it("sets the review date 12 months after approval by default", () => {
    const r = parseDpiaForm(form({ ...approvable, approvedOn: "2026-10-03" }, [{}]));
    expect(r.success).toBe(true);
    expect(r.data!.reviewOn).toBe("2027-10-03");
  });

  it("refuses approval while blockers remain, reporting them on the approval date", () => {
    const r = parseDpiaForm(form({ title: "CCTV", approvedOn: "2026-10-03" }));
    expect(r.success).toBe(false);
    const messages = r.error!.issues.filter((i) => i.path[0] === "approvedOn").map((i) => i.message);
    expect(messages).toContain("Record who approved the DPIA.");
    expect(messages).toContain("Identify at least one risk to the people whose data you process.");
  });

  it("reports approval blockers alongside other errors on the first submit", () => {
    const r = parseDpiaForm(form({ title: "CCTV", approvedOn: "2026-10-03" }, [{ description: "", mitigation: "Locks" }]));
    expect(r.success).toBe(false);
    const keys = new Set(r.error!.issues.map((i) => i.path[0]));
    expect(keys).toContain(riskErrorKey(0));
    expect(keys).toContain("approvedOn");
  });

  it("rejects bad dates and a review date before approval", () => {
    expect(parseDpiaForm(form({ title: "CCTV", reviewOn: "2026-02-30" })).success).toBe(false);
    const r = parseDpiaForm(form({ ...approvable, approvedOn: "2026-10-03", reviewOn: "2026-10-01" }, [{}]));
    expect(r.error!.issues.map((i) => i.path[0])).toEqual(["reviewOn"]);
  });
});

describe("templates", () => {
  it("have unique ids and complete risks", () => {
    expect(new Set(DPIA_TEMPLATES.map((t) => t.id)).size).toBe(DPIA_TEMPLATES.length);
    for (const t of DPIA_TEMPLATES) {
      expect(t.risks.length, t.id).toBeGreaterThan(0);
      expect(approvalBlockers({ ...t, approvedBy: "X", odpcConsultedOn: null }), t.id).toEqual([]);
    }
  });

  it("point at RoPA templates that exist", () => {
    const ropaIds = new Set(ACTIVITY_TEMPLATES.map((t) => t.id));
    for (const t of DPIA_TEMPLATES) if (t.activityTemplateId) expect(ropaIds.has(t.activityTemplateId), t.id).toBe(true);
  });

  it("cover every RoPA template that screening flags for a DPIA", () => {
    const covered = new Set(DPIA_TEMPLATES.map((t) => t.activityTemplateId));
    const flagged = ACTIVITY_TEMPLATES.filter((t) => t.systematicMonitoring || (t.sensitiveCategories.length > 0 && t.involvesChildren));
    for (const t of flagged) expect(covered.has(t.id), t.id).toBe(true);
  });

  it("offer at least one template to every sector", () => {
    for (const s of SECTOR_KEYS) expect(dpiaTemplatesForSector(s).length, s).toBeGreaterThan(0);
  });
});

describe("draftDpia", () => {
  const activity: ActivityInput & { templateId: string | null } = {
    name: "Visitor app",
    purpose: "Sign visitors in",
    lawfulBasis: "legitimate_interests",
    dataSubjects: ["Visitors"],
    dataCategories: ["Name", "Photo"],
    sensitiveCategories: ["Biometric data"],
    recipients: "App vendor",
    crossBorder: true,
    transferCountries: "Ireland",
    transferSafeguards: "",
    retentionPeriod: "6 months",
    securityMeasures: "",
    systems: "Visitor app",
    owner: "",
    largeScale: false,
    systematicMonitoring: false,
    involvesChildren: false,
    templateId: null,
  };

  it("uses the template that matches the activity's RoPA template", () => {
    const d = draftDpia({ ...activity, name: "Cameras", templateId: "cctv" }, undefined);
    expect(d.templateId).toBe("cctv");
    expect(d.title).toBe("Cameras");
    expect(d.risks).toBe(getDpiaTemplate("cctv")!.risks);
    expect(d.description).toContain("Whose data: Visitors.");
  });

  it("otherwise starts from the RoPA entry and its screening flags", () => {
    const d = draftDpia(activity, undefined);
    expect(d.templateId).toBeNull();
    expect(d.purposes).toBe("Sign visitors in");
    expect(d.necessity).toBe("Lawful basis: Legitimate interests of the controller or a third party.");
    expect(d.description).toContain("Transferred outside Kenya: Ireland.");
    const risks = d.risks.map((r) => r.description).join("\n");
    expect(risks).toMatch(/Sensitive data \(biometric data\)/);
    expect(risks).toMatch(/outside Kenya \(Ireland\)/);
    expect(risks).toMatch(/kept longer than needed/);
    // Measures are left for the organisation to fill in, so a fresh draft can't be approved as is.
    expect(d.risks.every((r) => r.mitigation === "")).toBe(true);
  });

  it("starts new processing from a template or blank", () => {
    expect(draftDpia(null, getDpiaTemplate("biometric-attendance"))).toMatchObject({
      title: "Biometric staff attendance",
      templateId: "biometric-attendance",
    });
    expect(draftDpia(null, undefined)).toEqual({
      title: "New processing",
      templateId: null,
      description: "",
      purposes: "",
      necessity: "",
      risks: [],
    });
  });
});
