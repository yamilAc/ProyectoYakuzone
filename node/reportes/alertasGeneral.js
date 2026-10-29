// Reporte general de alertas (Datos Históricos, botón "Reporte general de
// alertas"), en PDF o Excel: todas las alertas del sistema en el periodo con
// los datos del sensor y del propietario. Los datos los arma
// services/reportesService.js -> datosReporteAlertasGeneral().
const { ETIQUETAS, rangoTexto } = require('../utils/thresholds');
const c = require('./comun');

const TITULO = 'Reporte general de alertas';

const textoPorParametro = (porParametro) =>
  Object.entries(porParametro)
    .map(([parametro, n]) => `${ETIQUETAS[parametro] || parametro}: ${n}`)
    .join(' · ') || 'sin alertas';

const direccion = (a) => [a.propietario_direccion, a.propietario_nro_casa && `Casa Nº ${a.propietario_nro_casa}`].filter(Boolean).join(' · ');

function pdf(res, datos, { nombreArchivo, generadoPor }) {
  const { resumen, alertas, porSensor } = datos;
  const doc = c.iniciarPdf(res, { titulo: TITULO, subtitulo: c.periodoTexto(datos.desde, datos.hasta), nombreArchivo, generadoPor, horizontal: true });

  c.seccion(doc, 'Resumen');
  c.cuadrosResumen(doc, [
    { valor: resumen.total, etiqueta: 'Alertas en el periodo' },
    { valor: resumen.porEstado.pendiente, etiqueta: 'Sin asignar' },
    { valor: resumen.porEstado.asignada, etiqueta: 'Asignadas (en curso)' },
    { valor: resumen.porEstado.en_revision, etiqueta: 'Pendientes de revisión' },
    { valor: resumen.porEstado.mitigada, etiqueta: 'Mitigadas' },
    { valor: resumen.horasMitigacion === null ? '—' : `${c.fmtNum(resumen.horasMitigacion, 1)} h`, etiqueta: 'Tiempo prom. hasta mitigar' },
  ]);
  c.parrafo(doc, `Alertas por parámetro: ${textoPorParametro(resumen.porParametro)}.`);
  c.parrafo(doc, `Rangos aceptables (NB 512-04): pH ${rangoTexto('ph')}; turbidez ${rangoTexto('turbidez')}; conductividad ${rangoTexto('conductividad')}.`, {
    color: '#607D8B',
    tamano: 8,
  });

  if (porSensor.length > 0) {
    c.seccion(doc, 'Alertas por sensor');
    c.tabla(
      doc,
      [
        { titulo: 'Sensor', peso: 0.8 },
        { titulo: 'Ubicación', peso: 2 },
        { titulo: 'Propietario', peso: 1.6 },
        { titulo: 'Alertas', peso: 0.7, alinear: 'right' },
        { titulo: 'Mitigadas', peso: 0.7, alinear: 'right' },
        { titulo: 'Sin mitigar', peso: 0.7, alinear: 'right' },
      ],
      porSensor.map((s) => [s.n_serie, s.ubicacion || '—', s.propietario || 'Sin registrar', s.total, s.mitigadas, s.total - s.mitigadas])
    );
  }

  c.seccion(doc, 'Detalle de alertas');
  if (alertas.length === 0) {
    c.parrafo(doc, 'No se registraron alertas en el periodo seleccionado.');
  } else {
    c.tabla(
      doc,
      [
        { titulo: 'Nº', peso: 0.4, alinear: 'right' },
        { titulo: 'Fecha y hora', peso: 1 },
        { titulo: 'Sensor / ubicación', peso: 1.4 },
        { titulo: 'Propietario', peso: 1.5 },
        { titulo: 'Parámetro y valor', peso: 1.1 },
        { titulo: 'Estado', peso: 0.75 },
        { titulo: 'Equipo', peso: 1 },
        { titulo: 'Mitigación', peso: 1.9 },
      ],
      alertas.map((a) => [
        a.id,
        c.fmtFecha(a.fecha_hora),
        `${a.n_serie}${a.ubicacion ? `\n${a.ubicacion}` : ''}`,
        a.propietario_nombre
          ? `${a.propietario_nombre}${a.propietario_telefono ? `\nTel. ${a.propietario_telefono}` : ''}${direccion(a) ? `\n${direccion(a)}` : ''}`
          : 'Sin registrar',
        `${ETIQUETAS[a.parametro] || a.parametro}: ${c.fmtNum(a.valor)}`,
        c.ESTADOS[a.estado],
        a.equipo_nombre || '—',
        a.mitigado_en
          ? `${c.fmtFecha(a.mitigado_en)}${a.mitigado_por ? ` · ${a.mitigado_por}` : ''}${a.observacion_mitigacion ? `\n${a.observacion_mitigacion}` : ''}`
          : '—',
      ])
    );
  }
  c.finalizarPdf(doc);
}

async function excel(res, datos, { nombreArchivo, generadoPor }) {
  const { resumen, alertas, porSensor } = datos;
  const subtitulo = `${c.periodoTexto(datos.desde, datos.hasta)} · Generado el ${c.fmtFecha(new Date())}${generadoPor ? ` por ${generadoPor}` : ''}`;
  const libro = c.crearLibro();

  c.agregarHojaResumen(libro, 'Resumen', {
    titulo: TITULO,
    subtitulo,
    pares: [
      ['Alertas en el periodo', resumen.total],
      ['Sin asignar', resumen.porEstado.pendiente],
      ['Asignadas (en curso)', resumen.porEstado.asignada],
      ['Pendientes de revisión', resumen.porEstado.en_revision],
      ['Mitigadas', resumen.porEstado.mitigada],
      ['Alertas por parámetro', textoPorParametro(resumen.porParametro)],
      ['Tiempo promedio hasta mitigar (horas)', resumen.horasMitigacion === null ? '—' : Number(resumen.horasMitigacion.toFixed(1))],
      ['Rangos aceptables (NB 512-04)', `pH ${rangoTexto('ph')}; turbidez ${rangoTexto('turbidez')}; conductividad ${rangoTexto('conductividad')}`],
    ],
  });

  c.agregarHojaTabla(libro, 'Por sensor', {
    titulo: 'Alertas por sensor',
    subtitulo,
    columnas: [
      { titulo: 'Sensor', clave: 'n_serie', ancho: 11 },
      { titulo: 'Ubicación', clave: 'ubicacion', ancho: 34 },
      { titulo: 'Propietario', clave: 'propietario', ancho: 26 },
      { titulo: 'Alertas', clave: 'total', ancho: 10 },
      { titulo: 'Mitigadas', clave: 'mitigadas', ancho: 11 },
      { titulo: 'Sin mitigar', clave: 'sin_mitigar', ancho: 12 },
    ],
    filas: porSensor.map((s) => ({ ...s, sin_mitigar: s.total - s.mitigadas })),
  });

  c.agregarHojaTabla(libro, 'Alertas', {
    titulo: 'Detalle de alertas',
    subtitulo,
    columnas: [
      { titulo: 'Nº alerta', clave: 'id', ancho: 9 },
      { titulo: 'Fecha y hora', clave: 'fecha', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Sensor', clave: 'n_serie', ancho: 10 },
      { titulo: 'Ubicación', clave: 'ubicacion', ancho: 30 },
      { titulo: 'Propietario', clave: 'propietario_nombre', ancho: 24 },
      { titulo: 'CI', clave: 'propietario_ci', ancho: 13 },
      { titulo: 'Teléfono', clave: 'propietario_telefono', ancho: 13 },
      { titulo: 'Dirección', clave: 'direccion', ancho: 30 },
      { titulo: 'Teléfono de emergencia', clave: 'telefono_emergencia', ancho: 14 },
      { titulo: 'Parámetro', clave: 'parametro', ancho: 22 },
      { titulo: 'Valor', clave: 'valor', ancho: 9, formato: '0.00' },
      { titulo: 'Rango aceptable', clave: 'rango', ancho: 16 },
      { titulo: 'Estado', clave: 'estado', ancho: 12 },
      { titulo: 'Equipo', clave: 'equipo', ancho: 22 },
      { titulo: 'Asignada por', clave: 'asignado_por', ancho: 20 },
      { titulo: 'Asignada el', clave: 'asignado', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Instrucciones', clave: 'instrucciones', ancho: 30 },
      { titulo: 'Correo enviado', clave: 'correo', ancho: 9 },
      { titulo: 'WhatsApp enviado', clave: 'whatsapp', ancho: 10 },
      { titulo: 'Mitigada el', clave: 'mitigado', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Mitigada por', clave: 'mitigado_por', ancho: 20 },
      { titulo: 'Acciones realizadas', clave: 'observacion', ancho: 40 },
      { titulo: 'Visitas del equipo', clave: 'visitas', ancho: 10 },
      { titulo: 'Fotos de evidencia', clave: 'fotos', ancho: 10 },
    ],
    filas: alertas.map((a) => ({
      id: a.id,
      fecha: c.fechaExcel(a.fecha_hora),
      n_serie: a.n_serie,
      ubicacion: a.ubicacion,
      propietario_nombre: a.propietario_nombre,
      propietario_ci: a.propietario_ci,
      propietario_telefono: a.propietario_telefono,
      direccion: direccion(a) || null,
      telefono_emergencia: a.telefono_emergencia,
      parametro: ETIQUETAS[a.parametro] || a.parametro,
      valor: a.valor === null ? null : Number(a.valor),
      rango: rangoTexto(a.parametro),
      estado: c.ESTADOS[a.estado],
      equipo: a.equipo_nombre,
      asignado_por: a.asignado_por,
      asignado: c.fechaExcel(a.asignado_en),
      instrucciones: a.instrucciones,
      correo: a.equipo_nombre ? (a.correo_enviado ? 'Sí' : 'No') : null,
      whatsapp: a.equipo_nombre ? (a.whatsapp_enviado ? 'Sí' : 'No') : null,
      mitigado: c.fechaExcel(a.mitigado_en),
      mitigado_por: a.mitigado_por,
      observacion: a.observacion_mitigacion,
      visitas: Number(a.visitas),
      fotos: Number(a.fotos),
    })),
  });

  await c.enviarExcel(res, libro, nombreArchivo);
}

module.exports = { pdf, excel };
