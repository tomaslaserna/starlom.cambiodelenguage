declare module "pdfkit/js/pdfkit.standalone.js" {
  import type PDFDocument from "pdfkit";

  const PDFDocumentStandalone: typeof PDFDocument;
  export default PDFDocumentStandalone;
}
