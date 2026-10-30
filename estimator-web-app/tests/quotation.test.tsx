import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { QuotationPdf } from "@/components/quotation/quotation-pdf";
import { calculateEstimate } from "@/domain/costing/engine";
import type { Estimate } from "@/domain/estimate";
import { resolveQuery } from "@/domain/factories";
import { setReviewStatus } from "@/domain/measurements";
import { buildQuotation, QuotationError } from "@/domain/quotation";
import { emdadSampleEstimate } from "@/domain/reference-data/emdad";
import { DEFAULT_COMPANY_SETTINGS } from "@/domain/settings";
import { approveEstimate } from "@/domain/versioning";

const AT = "2026-10-29T12:00:00.000Z";

/** The EMDAD reference after an estimator has confirmed units, answered queries and approved the floor. */
function reviewedEmdad(): Estimate {
  const e = emdadSampleEstimate();
  e.costing.measurements = e.costing.measurements.map((m) => (m.id === "emdad-m-floor" ? setReviewStatus(m, "approved", "Checked p14", AT) : m));
  const units: Record<string, "lm" | "each" | "m2"> = { "emdad-l-header": "lm", "emdad-l-branding": "each", "emdad-l-glass": "m2" };
  e.costing.lineItems = e.costing.lineItems.map((l) => ({
    ...l,
    ...(units[l.id] ? { quantityUnit: units[l.id], rateUnit: units[l.id] } : {}),
    queries: l.queries.map((q) => resolveQuery(q, "Confirmed with XLive", AT)),
  }));
  return e;
}

async function pdfText(buffer: Uint8Array): Promise<string> {
  const task = getDocument({ data: buffer });
  const doc = await task.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  await task.destroy();
  return text;
}

describe("J: quotation", () => {
  const approved = approveEstimate(reviewedEmdad(), { versionId: "v1", approvedBy: "Estimator", note: "", acknowledgeWarnings: true, at: AT });
  const version = approved.versions[0];
  const quote = buildQuotation(version, DEFAULT_COMPANY_SETTINGS, { number: "XLQ-2026-0001", issueDate: "2026-10-29" });

  it("quotes exactly the approved version's pre-VAT price, with VAT excluded", () => {
    expect(version.calculation.directCost).toBe("65550.00");
    expect(quote.totalExVat).toBe("85215.00");
    expect(quote.totalExVat).toBe(version.calculation.sellingPriceExVat);
    expect(quote.vat.treatment).toBe("excluded");
    expect(quote.validUntil).toBe("2026-11-28");
    expect(quote.source).toMatchObject({ versionId: "v1", versionNo: 1 });
  });

  it("exposes no internal rates, line costs or markup", () => {
    for (const item of quote.scope) expect(Object.keys(item).sort()).toEqual(["description", "quantity"]);
    const json = JSON.stringify(quote);
    expect(json).not.toContain("65550");
    expect(json).not.toContain("19665");
    expect(json).not.toMatch(/"rate"|markup|margin|profit/i);
  });

  it("refuses to quote an estimate version that is not ready", () => {
    const notReady = { ...version, calculation: calculateEstimate(emdadSampleEstimate().costing) };
    expect(() => buildQuotation(notReady, DEFAULT_COMPANY_SETTINGS, { number: "X", issueDate: "2026-10-29" })).toThrow(QuotationError);
  });

  it("refuses a version whose snapshot no longer reproduces its stored total", () => {
    const tampered = structuredClone(version);
    tampered.costing.lineItems[0].rate = "999";
    expect(() => buildQuotation(tampered, DEFAULT_COMPANY_SETTINGS, { number: "X", issueDate: "2026-10-29" })).toThrow(/no longer reproduces/);
  });

  it("renders a PDF whose printed total matches the approved estimate and states VAT is excluded", async () => {
    const buffer = await renderToBuffer(<QuotationPdf doc={quote} />);
    const text = await pdfText(new Uint8Array(buffer));
    expect(text).toContain("XLQ-2026-0001");
    expect(text).toContain("SAR 85,215.00");
    expect(text).toContain("Total price (excluding VAT)");
    expect(text).toMatch(/exclude Value Added Tax/);
    expect(text).not.toContain("65,550");
    expect(text).not.toContain("165.00");
  }, 30_000);

  it("prints the XLive logo in the header", async () => {
    const buffer = await renderToBuffer(<QuotationPdf doc={quote} />);
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const { fnArray } = await (await pdf.getPage(1)).getOperatorList();
    expect(fnArray).toContain(OPS.paintImageXObject);
  }, 30_000);
});
