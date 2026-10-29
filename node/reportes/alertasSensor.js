// Reporte de alertas de un sensor (Datos Históricos, botón "Reporte de
// alertas" junto a "Verificar"), en PDF o Excel. Los datos los arma
// services/reportesService.js -> datosReporteAlertas().
const { ETIQUETAS, rangoTexto } = require('../utils/thresholds');
const c = require('./comun');

const titulo = (sensor) => `Reporte de alertas - Sensor ${sensor.n_serie}`;

const datosSensor = (sensor) => [
  ['Ubicación', sensor.ubicacion],
  ['Descripción', sensor.descripcion],
  ['Propietario', sensor.propietario_nombre],
  ['CI', sensor.propietario_ci],
  ['Teléfono', sensor.propietario_telefono],
  ['Dirección', [sensor.propietario_direccion, sensor.propietario_nro_casa && `Casa Nº ${sensor.propietario_nro_casa}`].filter(Boolean).join(' · ')],
  ['Teléfono de emergencia', sensor.telefono_emergencia],
];

const textoPorParametro = (porParametro) =>
  Object.entries(porParametro)
    .map(([parametro, n]) => `${ETIQUETAS[parametro] || parametro}: ${n}`)
    .join(' · ') || 'sin alertas';

function pdf(res, datos, { nombreArchivo, generadoPor }) {
  const { sensor, resumen, alertas } = datos;
  const doc = c.iniciarPdf(res, { titulo: titulo(sensor), subtitulo: c.periodoTexto(datos.desde, datos.hasta), nombreArchivo, generadoPor });

  c.seccion(doc, 'Datos del sensor');
  c.pares(doc, datosSensor(sensor));

  c.seccion(doc, 'Resumen');
  c.cuadrosResumen(doc, [
    { valor: resumen.total, etiqueta: 'Alertas en el periodo' },
    { valor: resumen.porEstado.pendiente, etiqueta: 'Sin asignar' },
    { valor: resumen.porEstado.asignada, etiqueta: 'Asignadas (en curso)' },
    { valor: resumen.porEstado.en_revision, etiqueta: 'Pendientes de revisión' },
    { valor: resumen.porEstado.mitigada, etiqueta: 'Mitigadas' },
  ]);
  c.parrafo(doc, `Alertas por parámetro: ${textoPorParametro(resumen.porParametro)}.`);
  c.parrafo(doc, `Rangos aceptables (NB 512-04): pH ${rangoTexto('ph')}; turbidez ${rangoTexto('turbidez')}; conductividad ${rangoTexto('conductividad')}.`, {
    color: '#607D8B',
    tamano: 8,
  });

  c.seccion(doc, 'Detalle de alertas');
  if (alertas.length === 0) {
    c.parrafo(doc, 'No se registraron alertas de este sensor en el periodo seleccionado.');
  } else {
    c.tabla(
      doc,
      [
        { titulo: 'Fecha y hora', peso: 1.1 },
        { titulo: 'Parámetro', peso: 1 },
        { titulo: 'Valor', peso: 0.7, alinear: 'right' },
        { titulo: 'Estado', peso: 0.8 },
        { titulo: 'Equipo', peso: 1.1 },
        { titulo: 'Mitigada', peso: 1.1 },
        { titulo: 'Acciones realizadas', peso: 2 },
      ],
      alertas.map((a) => [
        c.fmtFecha(a.fecha_hora),
        ETIQUETAS[a.parametro] || a.parametro,
        c.fmtNum(a.valor),
        c.ESTADOS[a.estado],
        a.equipo_nombre || '—',
        a.mitigado_en ? `${c.fmtFecha(a.mitigado_en)}${a.mitigado_por ? `\n${a.mitigado_por}` : ''}` : '—',
        a.observacion_mitigacion || '—',
      ])
    );
  }
  c.finalizarPdf(doc);
}

async function excel(res, datos, { nombreArchivo, generadoPor }) {
  const { sensor, resumen, alertas } = datos;
  const subtitulo = `${c.periodoTexto(datos.desde, datos.hasta)} · Generado el ${c.fmtFecha(new Date())}${generadoPor ? ` por ${generadoPor}` : ''}`;
  const libro = c.crearLibro();

  c.agregarHojaResumen(libro, 'Resumen', {
    titulo: titulo(sensor),
    subtitulo,
    pares: [
      ['Sensor', sensor.n_serie],
      ...datosSensor(sensor).filter(([, valor]) => valor),
      ['Alertas en el periodo', resumen.total],
      ['Sin asignar', resumen.porEstado.pendiente],
      ['Asignadas (en curso)', resumen.porEstado.asignada],
      ['Pendientes de revisión', resumen.porEstado.en_revision],
      ['Mitigadas', resumen.porEstado.mitigada],
      ['Alertas por parámetro', textoPorParametro(resumen.porParametro)],
    ],
  });

  c.agregarHojaTabla(libro, 'Alertas', {
    titulo: titulo(sensor),
    subtitulo,
    columnas: [
      { titulo: 'Nº alerta', clave: 'id', ancho: 10 },
      { titulo: 'Fecha y hora', clave: 'fecha', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Parámetro', clave: 'parametro', ancho: 22 },
      { titulo: 'Valor', clave: 'valor', ancho: 10, formato: '0.00' },
      { titulo: 'Rango aceptable', clave: 'rango', ancho: 18 },
      { titulo: 'Estado', clave: 'estado', ancho: 13 },
      { titulo: 'Equipo', clave: 'equipo', ancho: 24 },
      { titulo: 'Asignada el', clave: 'asignado', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Mitigada el', clave: 'mitigado', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Mitigada por', clave: 'mitigado_por', ancho: 22 },
      { titulo: 'Acciones realizadas', clave: 'observacion', ancho: 45 },
      { titulo: 'Visitas del equipo', clave: 'visitas', ancho: 10 },
    ],
    filas: alertas.map((a) => ({
      id: a.id,
      fecha: c.fechaExcel(a.fecha_hora),
      parametro: ETIQUETAS[a.parametro] || a.parametro,
      valor: a.valor === null ? null : Number(a.valor),
      rango: rangoTexto(a.parametro),
      estado: c.ESTADOS[a.estado],
      equipo: a.equipo_nombre,
      asignado: c.fechaExcel(a.asignado_en),
      mitigado: c.fechaExcel(a.mitigado_en),
      mitigado_por: a.mitigado_por,
      observacion: a.observacion_mitigacion,
      visitas: Number(a.visitas),
    })),
  });

  await c.enviarExcel(res, libro, nombreArchivo);
}

module.exports = { pdf, excel };
