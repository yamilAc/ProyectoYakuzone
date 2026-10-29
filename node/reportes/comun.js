// Piezas comunes de los reportes descargables: formato de fechas y números,
// y ayudantes para armar el PDF (PDFKit) y el Excel (ExcelJS) con el mismo
// estilo de la plataforma.
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const COLOR = {
  marca: '#0E7C9B',
  oscuro: '#0B5E77',
  texto: '#263238',
  suave: '#607D8B',
  linea: '#CFD8DC',
  zebra: '#F2F7F9',
};

const ESTADOS = { pendiente: 'Sin asignar', asignada: 'Asignada', mitigada: 'Mitigada' };

// ---------- Formato ----------

const dosDigitos = (n) => String(n).padStart(2, '0');

function fmtFecha(fecha, conHora = true) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  const dia = `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
  return conHora ? `${dia} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}` : dia;
}

function fmtNum(valor, decimales = 2) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

// "2026-10-01" -> "01/10/2026" (sin pasar por Date, para no correr el día por la zona horaria).
const fmtDia = (texto) => texto.split('-').reverse().join('/');

function periodoTexto(desde, hasta) {
  if (desde && hasta) return `Periodo: del ${fmtDia(desde)} al ${fmtDia(hasta)}`;
  if (desde) return `Periodo: desde el ${fmtDia(desde)}`;
  if (hasta) return `Periodo: hasta el ${fmtDia(hasta)}`;
  return 'Periodo: todo el historial registrado';
}

// ---------- PDF ----------

const MARGEN = 40;

function anchoUtil(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function limiteInferior(doc) {
  return doc.page.height - doc.page.margins.bottom;
}

// Si lo que sigue no entra en la página actual, pasa a la siguiente.
function asegurarEspacio(doc, alto) {
  if (doc.y + alto > limiteInferior(doc)) {
    doc.addPage();
  }
}

// Crea el documento, lo envía como descarga y dibuja el encabezado de marca.
// horizontal: hoja apaisada, para tablas con muchas columnas.
function iniciarPdf(res, { titulo, subtitulo, nombreArchivo, generadoPor, horizontal = false }) {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: horizontal ? 'landscape' : 'portrait',
    margins: { top: MARGEN, bottom: MARGEN + 15, left: MARGEN, right: MARGEN },
    bufferPages: true,
    info: { Title: titulo, Author: 'Yakuzone' },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 64).fill(COLOR.oscuro);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('Yakuzone', MARGEN, 18);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .text('Monitoreo de la calidad del agua · OTB Urbanización Hallein, Chiquicollo - Cochabamba', MARGEN, 40);

  doc.y = 84;
  doc.fillColor(COLOR.texto).font('Helvetica-Bold').fontSize(15).text(titulo, MARGEN);
  if (subtitulo) {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR.suave).text(subtitulo, MARGEN);
  }
  doc
    .fontSize(8.5)
    .fillColor(COLOR.suave)
    .text(`Generado el ${fmtFecha(new Date())}${generadoPor ? ` por ${generadoPor}` : ''}`, MARGEN);
  doc.moveDown(0.6);
  return doc;
}

function seccion(doc, titulo) {
  asegurarEspacio(doc, 60);
  doc.moveDown(0.6);
  doc.fillColor(COLOR.marca).font('Helvetica-Bold').fontSize(11.5).text(titulo, MARGEN);
  const y = doc.y + 2;
  doc.moveTo(MARGEN, y).lineTo(MARGEN + anchoUtil(doc), y).lineWidth(0.7).strokeColor(COLOR.linea).stroke();
  doc.y = y + 6;
  doc.fillColor(COLOR.texto).font('Helvetica').fontSize(9);
}

function parrafo(doc, texto, opciones = {}) {
  doc
    .fillColor(opciones.color || COLOR.texto)
    .font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opciones.tamano || 9)
    .text(texto, MARGEN, doc.y, { width: anchoUtil(doc) });
}

// Lista "Etiqueta: valor", omitiendo los valores vacíos.
function pares(doc, lista) {
  for (const [etiqueta, valor] of lista) {
    if (valor === null || valor === undefined || valor === '') continue;
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`${etiqueta}: `, MARGEN, doc.y, { continued: true, width: anchoUtil(doc) })
      .font('Helvetica')
      .text(String(valor));
  }
}

// Fila de recuadros con un número grande y su etiqueta (indicadores clave).
function cuadrosResumen(doc, items) {
  const separacion = 8;
  const alto = 46;
  const ancho = (anchoUtil(doc) - separacion * (items.length - 1)) / items.length;
  asegurarEspacio(doc, alto + 10);
  const y = doc.y + 2;
  items.forEach((item, i) => {
    const x = MARGEN + i * (ancho + separacion);
    doc.roundedRect(x, y, ancho, alto, 4).fillAndStroke(COLOR.zebra, COLOR.linea);
    doc.fillColor(COLOR.oscuro).font('Helvetica-Bold').fontSize(14).text(String(item.valor), x + 6, y + 8, { width: ancho - 12, align: 'center' });
    doc.fillColor(COLOR.suave).font('Helvetica').fontSize(7.5).text(item.etiqueta, x + 6, y + 28, { width: ancho - 12, align: 'center' });
  });
  doc.x = MARGEN;
  doc.y = y + alto + 10;
}

// Tabla con encabezado de color, filas alternadas y salto de página (el
// encabezado se repite en cada página). columnas: [{ titulo, peso, alinear }].
function tabla(doc, columnas, filas) {
  const total = columnas.reduce((suma, c) => suma + (c.peso || 1), 0);
  const anchos = columnas.map((c) => (anchoUtil(doc) * (c.peso || 1)) / total);
  const relleno = 4;
  doc.fontSize(8);

  const altoFila = (celdas, fuente) => {
    doc.font(fuente);
    return Math.max(...celdas.map((texto, i) => doc.heightOfString(String(texto), { width: anchos[i] - relleno * 2 }))) + relleno * 2;
  };

  const dibujarFila = (celdas, y, alto, { fondo, fuente, color }) => {
    if (fondo) doc.rect(MARGEN, y, anchoUtil(doc), alto).fill(fondo);
    let x = MARGEN;
    celdas.forEach((texto, i) => {
      doc
        .fillColor(color)
        .font(fuente)
        .fontSize(8)
        .text(String(texto), x + relleno, y + relleno, { width: anchos[i] - relleno * 2, align: columnas[i].alinear || 'left' });
      x += anchos[i];
    });
  };

  const titulos = columnas.map((c) => c.titulo);
  const dibujarEncabezado = () => {
    const alto = altoFila(titulos, 'Helvetica-Bold');
    asegurarEspacio(doc, alto + 16);
    const y = doc.y;
    dibujarFila(titulos, y, alto, { fondo: COLOR.marca, fuente: 'Helvetica-Bold', color: '#ffffff' });
    doc.y = y + alto;
  };

  dibujarEncabezado();
  filas.forEach((celdas, indice) => {
    const alto = altoFila(celdas, 'Helvetica');
    if (doc.y + alto > limiteInferior(doc)) {
      doc.addPage();
      dibujarEncabezado();
    }
    const y = doc.y;
    dibujarFila(celdas, y, alto, { fondo: indice % 2 ? COLOR.zebra : null, fuente: 'Helvetica', color: COLOR.texto });
    doc.y = y + alto;
  });
  doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + anchoUtil(doc), doc.y).lineWidth(0.5).strokeColor(COLOR.linea).stroke();
  doc.x = MARGEN;
  doc.y += 6;
}

// Pie con número de página en todas las hojas y cierre del documento.
function finalizarPdf(doc) {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // escribir en el margen sin que PDFKit agregue otra página
    const y = doc.page.height - 32;
    doc.fillColor(COLOR.suave).font('Helvetica').fontSize(7.5);
    doc.text('Yakuzone · Reporte generado automáticamente por la plataforma', MARGEN, y, { lineBreak: false });
    doc.text(`Página ${i - start + 1} de ${count}`, MARGEN, y, { width: anchoUtil(doc), align: 'right', lineBreak: false });
    doc.page.margins.bottom = margenInferior;
  }
  doc.end();
}

// ---------- Excel ----------

function crearLibro() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Yakuzone';
  libro.created = new Date();
  return libro;
}

// ExcelJS guarda las fechas en UTC; se corrige para que la celda muestre la
// hora local en la que ocurrió cada evento.
function fechaExcel(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

function estiloEncabezado(celda) {
  celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7C9B' } };
  celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  celda.border = { bottom: { style: 'thin', color: { argb: 'FF0B5E77' } } };
}

function tituloHoja(hoja, titulo, subtitulo, columnas) {
  hoja.mergeCells(1, 1, 1, columnas);
  hoja.getCell(1, 1).value = titulo;
  hoja.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF0B5E77' } };
  hoja.mergeCells(2, 1, 2, columnas);
  hoja.getCell(2, 1).value = subtitulo;
  hoja.getCell(2, 1).font = { italic: true, color: { argb: 'FF607D8B' } };
}

// Hoja con una tabla: columnas [{ titulo, clave, ancho, formato }].
function agregarHojaTabla(libro, nombre, { titulo, subtitulo, columnas, filas }) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 4 }] });
  hoja.columns = columnas.map((c) => ({ key: c.clave, width: c.ancho || 16 }));
  tituloHoja(hoja, titulo, subtitulo, columnas.length);

  const encabezado = hoja.getRow(4);
  encabezado.values = columnas.map((c) => c.titulo);
  encabezado.height = 30;
  encabezado.eachCell(estiloEncabezado);

  filas.forEach((fila) => hoja.addRow(columnas.map((c) => fila[c.clave] ?? null)));
  columnas.forEach((c, i) => {
    if (c.formato) hoja.getColumn(i + 1).numFmt = c.formato;
    hoja.getColumn(i + 1).alignment = { vertical: 'top', wrapText: true };
  });
  hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columnas.length } };
  return hoja;
}

// Hoja de resumen con pares "Indicador / Valor".
function agregarHojaResumen(libro, nombre, { titulo, subtitulo, pares: lista }) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = [{ width: 38 }, { width: 40 }];
  tituloHoja(hoja, titulo, subtitulo, 2);
  const encabezado = hoja.getRow(4);
  encabezado.values = ['Indicador', 'Valor'];
  encabezado.eachCell(estiloEncabezado);
  lista.forEach(([etiqueta, valor]) => {
    const fila = hoja.addRow([etiqueta, valor ?? '—']);
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { horizontal: 'left' };
  });
  return hoja;
}

async function enviarExcel(res, libro, nombreArchivo) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  await libro.xlsx.write(res);
  res.end();
}

module.exports = {
  ESTADOS,
  fmtFecha,
  fmtNum,
  periodoTexto,
  iniciarPdf,
  seccion,
  parrafo,
  pares,
  cuadrosResumen,
  tabla,
  finalizarPdf,
  crearLibro,
  fechaExcel,
  agregarHojaTabla,
  agregarHojaResumen,
  enviarExcel,
};
