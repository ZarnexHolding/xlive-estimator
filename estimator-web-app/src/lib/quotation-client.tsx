"use client";

import type { QuotationDocument } from "@/domain/quotation";

/** Render the customer quotation to a PDF in the browser (library loaded on demand). */
export async function renderQuotationPdf(doc: QuotationDocument): Promise<Blob> {
  const [{ pdf }, { QuotationPdf }] = await Promise.all([import("@react-pdf/renderer"), import("@/components/quotation/quotation-pdf")]);
  return pdf(<QuotationPdf doc={doc} />).toBlob();
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
