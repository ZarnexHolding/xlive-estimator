/**
 * Fingerprints of the reference PDFs in /reference-docs. Used to recognise a reference file
 * so the developer-prepared extraction (docs/reference-document-analysis.md) can be offered
 * when AI analysis is not configured. That extraction is labelled "not AI output".
 */
export const REFERENCE_DOCUMENTS = [
  {
    key: "emdad",
    fileName: "Costing EMDAD 14m x 5m.pdf",
    sha256: "b728b281c3d829dc4569d616d0d0510628d108c3f1404e506880344b98dbff1b",
    pageCount: 16,
  },
  {
    key: "idcube",
    fileName: "IDCUBE 6m X 6m XLive.pdf",
    sha256: "701a9d022752366c9c7e2a70db8ab78353b998280a79bb432ac0fb3fe1b0c2ac",
    pageCount: 11,
  },
  {
    key: "smc",
    fileName: "SMC Paddock Car Display V2.pdf",
    sha256: "f825e8bf9786049c36ed8c10993649069832b65f6edf2535bd5aafb6be5dc03c",
    pageCount: 22,
  },
] as const;

export type ReferenceKey = (typeof REFERENCE_DOCUMENTS)[number]["key"];

export function findReferenceDocument(sha256: string) {
  return REFERENCE_DOCUMENTS.find((d) => d.sha256 === sha256.toLowerCase()) ?? null;
}

/** Timestamp used for all seeded reference records (date of the reference analysis). */
export const REFERENCE_AT = "2026-10-29T00:00:00.000Z";
