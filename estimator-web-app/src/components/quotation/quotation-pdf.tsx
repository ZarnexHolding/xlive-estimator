import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { QuotationDocument } from "@/domain/quotation";
import { formatAmount } from "@/lib/format";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#111", paddingBottom: 12, marginBottom: 18 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 4 },
  brandSub: { fontSize: 8, letterSpacing: 2, color: "#555", marginTop: 2 },
  small: { fontSize: 8, color: "#555", lineHeight: 1.4 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  metaGrid: { flexDirection: "row", gap: 24, marginBottom: 18 },
  metaCol: { flex: 1 },
  label: { fontSize: 7.5, color: "#666", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  value: { fontSize: 9.5, marginBottom: 6 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111", paddingVertical: 4, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 5 },
  colNo: { width: 24 },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 90, textAlign: "right" },
  totalBox: { marginTop: 14, alignSelf: "flex-end", width: 260, borderTopWidth: 1, borderTopColor: "#111", paddingTop: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 2, lineHeight: 1.35 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#777" },
});

/**
 * Customer-facing quotation. Built only from a QuotationDocument, which by construction
 * carries no internal rates, line costs or markup.
 */
export function QuotationPdf({ doc }: { doc: QuotationDocument }) {
  const c = doc.company;
  return (
    <Document title={`Quotation ${doc.number}`} author={c.companyName} subject={doc.client.projectName}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.brand}>XLIVE</Text>
            <Text style={s.brandSub}>PRODUCTION</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{c.companyName}</Text>
            {c.legalName ? <Text style={s.small}>{c.legalName}</Text> : null}
            {c.addressLines.map((line, i) => (
              <Text key={i} style={s.small}>
                {line}
              </Text>
            ))}
            <Text style={s.small}>{[c.phone, c.email, c.website].filter(Boolean).join("  ·  ")}</Text>
            {c.commercialRegistration ? <Text style={s.small}>CR {c.commercialRegistration}</Text> : null}
            {c.vatNumber ? <Text style={s.small}>VAT no. {c.vatNumber}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>Quotation</Text>
        <View style={s.metaGrid}>
          <View style={s.metaCol}>
            <Text style={s.label}>Client</Text>
            <Text style={s.value}>{doc.client.name || "—"}</Text>
            <Text style={s.label}>Project</Text>
            <Text style={s.value}>{doc.client.projectName}</Text>
            <Text style={s.label}>Type</Text>
            <Text style={s.value}>{doc.client.projectType}</Text>
            {doc.client.venue ? (
              <>
                <Text style={s.label}>Venue</Text>
                <Text style={s.value}>{doc.client.venue}</Text>
              </>
            ) : null}
            {doc.client.eventDates ? (
              <>
                <Text style={s.label}>Dates</Text>
                <Text style={s.value}>{doc.client.eventDates}</Text>
              </>
            ) : null}
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Quotation reference</Text>
            <Text style={s.value}>{doc.number}</Text>
            <Text style={s.label}>Issue date</Text>
            <Text style={s.value}>{doc.issueDate}</Text>
            <Text style={s.label}>Valid until</Text>
            <Text style={s.value}>{doc.validUntil}</Text>
            <Text style={s.label}>Currency</Text>
            <Text style={s.value}>{doc.currency}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Scope of work</Text>
        <View style={s.tableHead}>
          <Text style={s.colNo}>#</Text>
          <Text style={s.colDesc}>Description</Text>
          <Text style={s.colQty}>Quantity</Text>
        </View>
        {doc.scope.map((item, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.colNo}>{i + 1}</Text>
            <Text style={s.colDesc}>{item.description}</Text>
            <Text style={s.colQty}>{item.quantity ?? "Included"}</Text>
          </View>
        ))}

        <View style={s.totalBox} wrap={false}>
          <View style={s.totalRow}>
            <Text>Total price (excluding VAT)</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalValue}>
              {doc.currency} {formatAmount(doc.totalExVat)}
            </Text>
          </View>
          <Text style={s.small}>{doc.vat.statement}</Text>
        </View>

        {doc.basis.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Basis of quotation</Text>
            {doc.basis.map((b, i) => (
              <Text key={i} style={s.bullet}>
                • {b}
              </Text>
            ))}
          </View>
        )}
        {doc.exclusions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Exclusions</Text>
            {doc.exclusions.map((x, i) => (
              <Text key={i} style={s.bullet}>
                • {x}
              </Text>
            ))}
          </View>
        )}
        {doc.terms.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Terms</Text>
            {doc.terms.map((t, i) => (
              <Text key={i} style={s.bullet}>
                • {t}
              </Text>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            {doc.number} · estimate version v{doc.source.versionNo} approved {doc.source.approvedAt.slice(0, 10)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
