// Reporte general del sistema (Datos Históricos, botón "Reporte general"), en
// PDF o Excel: indicadores clave, calidad del agua por sensor, alertas y
// desempeño de los equipos de mitigación. Los datos los arma
// services/reportesService.js -> datosReporteGeneral().
const { ETIQUETAS, rangoTexto } = require('../utils/thresholds');
const c = require('./comun');

const TITULO = 'Reporte general del sistema';
// En el PDF el detalle de alertas se incluye solo si es razonable imprimirlo;
// el Excel siempre lleva el detalle completo.
const MAX_ALERTAS_PDF = 300;

const horas = (minutos) => (minutos === null || minutos === undefined ? null : Number(minutos) / 60);

const textoPorParametro = (porParametro) =>
  Object.entries(porParametro)
    .map(([parametro, n]) => `${ETIQUETAS[parametro] || parametro}: ${n}`)
    .join(' · ') || 'sin alertas';

function pdf(res, datos, { nombreArchivo, generadoPor }) {
  const { resumen, sensores, equipos, alertas } = datos;
  const doc = c.iniciarPdf(res, { titulo: TITULO, subtitulo: c.periodoTexto(datos.desde, datos.hasta), nombreArchivo, generadoPor });

  c.seccion(doc, 'Indicadores clave');
  c.cuadrosResumen(doc, [
    { valor: resumen.sensores, etiqueta: 'Sensores registrados' },
    { valor: c.fmtNum(resumen.lecturas, 0), etiqueta: 'Lecturas en el periodo' },
    { valor: `${c.fmtNum(resumen.porcentajeFueraDeRango, 1)} %`, etiqueta: 'Lecturas fuera de rango' },
  ]);
  c.cuadrosResumen(doc, [
    { valor: resumen.total, etiqueta: 'Alertas generadas' },
    { valor: resumen.porEstado.mitigada, etiqueta: 'Alertas mitigadas' },
    { valor: resumen.porEstado.pendiente + resumen.porEstado.asignada, etiqueta: 'Alertas sin mitigar' },
    { valor: resumen.horasMitigacion === null ? '—' : `${c.fmtNum(resumen.horasMitigacion, 1)} h`, etiqueta: 'Tiempo prom. hasta mitigar' },
  ]);
  c.parrafo(
    doc,
    `Alertas por estado: sin asignar ${resumen.porEstado.pendiente} · asignadas ${resumen.porEstado.asignada} · mitigadas ${resumen.porEstado.mitigada}. Por parámetro: ${textoPorParametro(resumen.porParametro)}.`
  );
  c.parrafo(doc, `Rangos aceptables (NB 512-04): pH ${rangoTexto('ph')}; turbidez ${rangoTexto('turbidez')}; conductividad ${rangoTexto('conductividad')}.`, {
    color: '#607D8B',
    tamano: 8,
  });

  c.seccion(doc, 'Calidad del agua por sensor');
  c.tabla(
    doc,
    [
      { titulo: 'Sensor', peso: 1.3 },
      { titulo: 'Lecturas', peso: 0.8, alinear: 'right' },
      { titulo: 'pH prom. (mín - máx)', peso: 1.3, alinear: 'center' },
      { titulo: 'Turbidez prom. / máx. (NTU)', peso: 1.3, alinear: 'center' },
      { titulo: 'Conductividad prom. / máx. (µS/cm)', peso: 1.5, alinear: 'center' },
      { titulo: 'Temp. prom. (°C)', peso: 0.9, alinear: 'right' },
      { titulo: '% fuera de rango', peso: 0.9, alinear: 'right' },
      { titulo: 'Alertas', peso: 0.7, alinear: 'right' },
    ],
    sensores.map((s) => [
      `${s.n_serie}\n${s.ubicacion || ''}`.trim(),
      c.fmtNum(s.lecturas, 0),
      Number(s.lecturas) ? `${c.fmtNum(s.ph_prom)} (${c.fmtNum(s.ph_min)} - ${c.fmtNum(s.ph_max)})` : '—',
      Number(s.lecturas) ? `${c.fmtNum(s.turb_prom)} / ${c.fmtNum(s.turb_max)}` : '—',
      Number(s.lecturas) ? `${c.fmtNum(s.cond_prom, 0)} / ${c.fmtNum(s.cond_max, 0)}` : '—',
      c.fmtNum(s.temp_prom, 1),
      s.porcentaje_fuera === null ? '—' : `${c.fmtNum(s.porcentaje_fuera, 1)} %`,
      s.alertas,
    ])
  );

  c.seccion(doc, 'Equipos de mitigación');
  if (equipos.length === 0) {
    c.parrafo(doc, 'Todavía no hay equipos de mitigación registrados.');
  } else {
    c.tabla(
      doc,
      [
        { titulo: 'Equipo', peso: 1.6 },
        { titulo: 'Jefe', peso: 1.5 },
        { titulo: 'Asignadas', peso: 0.8, alinear: 'right' },
        { titulo: 'Mitigadas', peso: 0.8, alinear: 'right' },
        { titulo: 'En curso', peso: 0.8, alinear: 'right' },
        { titulo: 'Tiempo prom. de atención', peso: 1.1, alinear: 'right' },
      ],
      equipos.map((e) => [
        e.nombre,
        e.jefe || 'Sin jefe',
        e.asignadas,
        e.mitigadas || 0,
        e.en_curso || 0,
        e.minutos_prom === null ? '—' : `${c.fmtNum(horas(e.minutos_prom), 1)} h`,
      ])
    );
    c.parrafo(doc, 'Tiempo de atención: desde que se asigna la alerta al equipo hasta que su jefe la marca como mitigada.', {
      color: '#607D8B',
      tamano: 8,
    });
  }

  c.seccion(doc, 'Detalle de alertas');
  if (alertas.length === 0) {
    c.parrafo(doc, 'No se registraron alertas en el periodo seleccionado.');
  } else if (alertas.length > MAX_ALERTAS_PDF) {
    c.parrafo(doc, `En el periodo hay ${alertas.length} alertas; el detalle completo está en la versión Excel de este reporte.`);
  } else {
    c.tabla(
      doc,
      [
        { titulo: 'Fecha y hora', peso: 1.1 },
        { titulo: 'Sensor', peso: 0.8 },
        { titulo: 'Parámetro', peso: 1 },
        { titulo: 'Valor', peso: 0.7, alinear: 'right' },
        { titulo: 'Estado', peso: 0.8 },
        { titulo: 'Equipo', peso: 1.2 },
        { titulo: 'Mitigada el', peso: 1.1 },
      ],
      alertas.map((a) => [
        c.fmtFecha(a.fecha_hora),
        a.n_serie,
        ETIQUETAS[a.parametro] || a.parametro,
        c.fmtNum(a.valor),
        c.ESTADOS[a.estado],
        a.equipo_nombre || '—',
        a.mitigado_en ? c.fmtFecha(a.mitigado_en) : '—',
      ])
    );
  }
  c.finalizarPdf(doc);
}

async function excel(res, datos, { nombreArchivo, generadoPor }) {
  const { resumen, sensores, equipos, alertas } = datos;
  const subtitulo = `${c.periodoTexto(datos.desde, datos.hasta)} · Generado el ${c.fmtFecha(new Date())}${generadoPor ? ` por ${generadoPor}` : ''}`;
  const libro = c.crearLibro();

  c.agregarHojaResumen(libro, 'Resumen', {
    titulo: TITULO,
    subtitulo,
    pares: [
      ['Sensores registrados', resumen.sensores],
      ['Lecturas en el periodo', resumen.lecturas],
      ['Lecturas fuera de rango (%)', resumen.porcentajeFueraDeRango === null ? '—' : Number(resumen.porcentajeFueraDeRango.toFixed(1))],
      ['Alertas generadas', resumen.total],
      ['Sin asignar', resumen.porEstado.pendiente],
      ['Asignadas (en curso)', resumen.porEstado.asignada],
      ['Mitigadas', resumen.porEstado.mitigada],
      ['Alertas por parámetro', textoPorParametro(resumen.porParametro)],
      ['Tiempo promedio hasta mitigar (horas)', resumen.horasMitigacion === null ? '—' : Number(resumen.horasMitigacion.toFixed(1))],
      ['Equipos de mitigación', resumen.equipos],
      ['Rangos aceptables (NB 512-04)', `pH ${rangoTexto('ph')}; turbidez ${rangoTexto('turbidez')}; conductividad ${rangoTexto('conductividad')}`],
    ],
  });

  const numero = (valor, decimales = 2) => (valor === null || valor === undefined ? null : Number(Number(valor).toFixed(decimales)));
  c.agregarHojaTabla(libro, 'Sensores', {
    titulo: 'Calidad del agua por sensor',
    subtitulo,
    columnas: [
      { titulo: 'Sensor', clave: 'n_serie', ancho: 12 },
      { titulo: 'Ubicación', clave: 'ubicacion', ancho: 32 },
      { titulo: 'Propietario', clave: 'propietario_nombre', ancho: 24 },
      { titulo: 'Lecturas', clave: 'lecturas', ancho: 10 },
      { titulo: 'pH prom.', clave: 'ph_prom', ancho: 10, formato: '0.00' },
      { titulo: 'pH mín.', clave: 'ph_min', ancho: 10, formato: '0.00' },
      { titulo: 'pH máx.', clave: 'ph_max', ancho: 10, formato: '0.00' },
      { titulo: 'Turbidez prom. (NTU)', clave: 'turb_prom', ancho: 12, formato: '0.00' },
      { titulo: 'Turbidez máx. (NTU)', clave: 'turb_max', ancho: 12, formato: '0.00' },
      { titulo: 'Conductividad prom. (µS/cm)', clave: 'cond_prom', ancho: 14, formato: '0' },
      { titulo: 'Conductividad máx. (µS/cm)', clave: 'cond_max', ancho: 14, formato: '0' },
      { titulo: 'Temperatura prom. (°C)', clave: 'temp_prom', ancho: 12, formato: '0.0' },
      { titulo: 'Lecturas fuera de rango', clave: 'fuera_de_rango', ancho: 12 },
      { titulo: '% fuera de rango', clave: 'porcentaje', ancho: 11, formato: '0.0' },
      { titulo: 'Alertas', clave: 'alertas', ancho: 9 },
      { titulo: 'Última lectura', clave: 'ultima', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
    ],
    filas: sensores.map((s) => ({
      ...s,
      lecturas: Number(s.lecturas),
      ph_prom: numero(s.ph_prom),
      ph_min: numero(s.ph_min),
      ph_max: numero(s.ph_max),
      turb_prom: numero(s.turb_prom),
      turb_max: numero(s.turb_max),
      cond_prom: numero(s.cond_prom, 0),
      cond_max: numero(s.cond_max, 0),
      temp_prom: numero(s.temp_prom, 1),
      fuera_de_rango: Number(s.fuera_de_rango || 0),
      porcentaje: numero(s.porcentaje_fuera, 1),
      ultima: c.fechaExcel(s.ultima_lectura),
    })),
  });

  c.agregarHojaTabla(libro, 'Equipos', {
    titulo: 'Equipos de mitigación',
    subtitulo,
    columnas: [
      { titulo: 'Equipo', clave: 'nombre', ancho: 28 },
      { titulo: 'Jefe', clave: 'jefe', ancho: 26 },
      { titulo: 'Alertas asignadas', clave: 'asignadas', ancho: 12 },
      { titulo: 'Mitigadas', clave: 'mitigadas', ancho: 11 },
      { titulo: 'En curso', clave: 'en_curso', ancho: 10 },
      { titulo: 'Tiempo prom. de atención (h)', clave: 'horas', ancho: 16, formato: '0.0' },
    ],
    filas: equipos.map((e) => ({
      nombre: e.nombre,
      jefe: e.jefe || 'Sin jefe',
      asignadas: Number(e.asignadas),
      mitigadas: Number(e.mitigadas || 0),
      en_curso: Number(e.en_curso || 0),
      horas: e.minutos_prom === null ? null : numero(horas(e.minutos_prom), 1),
    })),
  });

  c.agregarHojaTabla(libro, 'Alertas', {
    titulo: 'Detalle de alertas',
    subtitulo,
    columnas: [
      { titulo: 'Nº alerta', clave: 'id', ancho: 10 },
      { titulo: 'Fecha y hora', clave: 'fecha', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Sensor', clave: 'n_serie', ancho: 11 },
      { titulo: 'Ubicación', clave: 'ubicacion', ancho: 30 },
      { titulo: 'Parámetro', clave: 'parametro', ancho: 22 },
      { titulo: 'Valor', clave: 'valor', ancho: 10, formato: '0.00' },
      { titulo: 'Estado', clave: 'estado', ancho: 13 },
      { titulo: 'Equipo', clave: 'equipo', ancho: 24 },
      { titulo: 'Mitigada el', clave: 'mitigado', ancho: 18, formato: 'dd/mm/yyyy hh:mm' },
      { titulo: 'Mitigada por', clave: 'mitigado_por', ancho: 22 },
      { titulo: 'Acciones realizadas', clave: 'observacion', ancho: 45 },
    ],
    filas: alertas.map((a) => ({
      id: a.id,
      fecha: c.fechaExcel(a.fecha_hora),
      n_serie: a.n_serie,
      ubicacion: a.ubicacion,
      parametro: ETIQUETAS[a.parametro] || a.parametro,
      valor: a.valor === null ? null : Number(a.valor),
      estado: c.ESTADOS[a.estado],
      equipo: a.equipo_nombre,
      mitigado: c.fechaExcel(a.mitigado_en),
      mitigado_por: a.mitigado_por,
      observacion: a.observacion_mitigacion,
    })),
  });

  await c.enviarExcel(res, libro, nombreArchivo);
}

module.exports = { pdf, excel };
