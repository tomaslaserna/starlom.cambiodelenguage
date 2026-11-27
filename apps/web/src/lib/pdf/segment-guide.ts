import type { SegmentGuide, SegmentGuideProduct } from "@/lib/segment-guide-domain";
import { createPdfFile, pdfDate, pdfNumber } from "@/lib/pdf/renderer";

export async function buildSegmentGuidePdf(guide: SegmentGuide) {
  return createPdfFile(`starlim-sugerencias-por-rubro-${guide.period.generatedOn}.pdf`, ({pdf}) => {
    const {doc} = pdf;
    const header = (number: string) => pdf.drawHeader({
      title: "Sugerencias por rubro", code: "GUIA", number,
      date: pdfDate(guide.period.generatedOn), variant: "internal",
      footerLeft: "StarLim · Guía comercial por rubro", footerRight: pdfDate(guide.period.generatedOn),
    });
    header("Guía comercial");
    pdf.title("Compras reales para asesorar mejor", 19);
    pdf.muted(`Historial: ${pdfDate(guide.period.from)} al ${pdfDate(guide.period.through)}. Últimos 90 días completos, según fecha de Argentina.`);
    pdf.section("Cómo usar esta guía");
    for (const text of [
      "Cada rubro reúne productos activos comprados por sus clientes con clasificación confirmada. Se consideran ventas entregadas de la empresa, fuentes canónicas y cantidades netas de devoluciones y ajustes operativos, sin duplicar sus comprobantes fiscales.",
      "La cantidad orientativa es la media de unidades entre los pedidos que incluyeron cada producto, redondeada al entero más cercano (mínimo una unidad). Se informa también el promedio sin redondear y cuántos pedidos lo respaldan. No es consumo mensual.",
      "Habitual: comprado por al menos dos clientes o por el 20% de los compradores del rubro. Ocasional: no alcanza ese umbral. La cobertura usa como denominador los clientes con compras netas de productos activos en el período.",
      "Los rubros con menos de cinco compradores se identifican como preliminares. Sin compras válidas, la sección se conserva sin inventar necesidades ni cantidades. Las clasificaciones sugeridas pendientes de revisión no participan.",
      "Validá tamaño del negocio, frecuencia de reposición y alternativas con cada cliente: los productos de esta guía no necesariamente se compran juntos. El catálogo refleja necesidades observadas, no todas las necesidades posibles.",
      "Para cotizar, usá Presupuestos > Presupuestos base: hasta veinte productos habituales, precios vigentes y edición completa. Este PDF no fija precios ni reserva stock. Cada descarga vuelve a calcular el historial.",
    ]) {
      pdf.ensureSpace(85);
      pdf.muted(text);
      doc.y += 10;
    }
    // Reserve index pages before writing sections, then fill actual page numbers.
    const entriesPerPage = 22;
    const indexPages = Math.max(1, Math.ceil(guide.segments.length / entriesPerPage));
    for (let i=0;i<indexPages;i++) {doc.addPage(); header(`Índice ${i+1}`);}
    const entries: {segment: string; page: number}[] = [];
    for (const group of guide.segments) {
      doc.addPage();
      header(group.segment);
      entries.push({segment: group.segment, page: doc.bufferedPageRange().count});
      pdf.title(group.segment, 19);
      pdf.muted(`${group.customerCount} clientes compradores · ${group.orderCount} pedidos con productos activos, netos de devoluciones.`);
      if (group.preliminary && group.products.length) {
        doc.y += 8;
        pdf.muted("BASE PRELIMINAR: menos de 5 compradores. Confirmar cantidades con el cliente.");
      }
      doc.y += 12;
      if (!group.products.length) {
        pdf.title("Sin historial suficiente", 13);
        pdf.muted("No hay compras válidas de productos activos para este rubro en el período. Revisá la clasificación de clientes y registrá ventas entregadas antes de usar una base.");
        continue;
      }
      pdf.muted("Cantidad orientativa por pedido en unidades de venta; presentación según catálogo. El nombre indica capacidad o formato cuando están registrados.", {density:"compact"});
      doc.y += 10;
      const table = (title: string, products: SegmentGuideProduct[]) => {
        pdf.ensureSpace(85);
        pdf.title(title, 12);
        doc.y += 6;
        pdf.table([
          {label:"Producto / código",width:208},
          {label:"Presentación",width:68},
          {label:"Cant. / media",width:72,align:"right"},
          {label:"Pedidos",width:54,align:"right"},
          {label:"Compradores",width:102,align:"right"},
        ], products.map(p=>[
          `${p.name}${p.code ? `\n${p.code}` : ""}`,
          `${pdfNumber(p.presentationUnits,0)} un.`,
          `${pdfNumber(p.quantity,0)} / ${pdfNumber(p.averageQuantity)}`,
          pdfNumber(p.orderCount,0),
          `${p.buyerCount}/${group.customerCount} (${pdfNumber(p.coveragePercent,1)}%)`,
        ]), {density:"compact"});
      };
      const usual=group.products.filter(p=>p.habitual);
      const occasional=group.products.filter(p=>!p.habitual);
      if (usual.length) table("Habituales",usual);
      if (occasional.length) table("Ocasionales",occasional);
    }
    for (let i=0;i<indexPages;i++) {
      doc.switchToPage(i+1);
      pdf.setY(180);
      pdf.title("Índice de rubros",17);
      doc.y += 14;
      for (const [position,entry] of entries.slice(i*entriesPerPage,(i+1)*entriesPerPage).entries()) {
        const y=doc.y;
        doc.font("Helvetica").fontSize(10).fillColor("#1f3a60");
        doc.text(`${i*entriesPerPage+position+1}. ${entry.segment}`,54,y,{width:445,lineBreak:false});
        doc.text(String(entry.page),510,y,{width:48,align:"right",lineBreak:false});
        doc.y=y+21;
      }
    }
  });
}
