// Constantes compartidas por Notificaciones (lista y detalle de alertas) y
// Equipos de mitigación. Coinciden con node/utils/thresholds.js y con los
// estados de la tabla `alertas` del backend.

export const ETIQUETAS_PARAMETRO = {
  ph: 'pH',
  turbidez: 'Turbidez',
  conductividad: 'Conductividad eléctrica',
};

export const UNIDADES_PARAMETRO = {
  ph: '',
  turbidez: ' NTU',
  conductividad: ' µS/cm',
};

// Seguimiento de una alerta: pendiente (sin equipo) -> asignada -> mitigada.
export const ESTADOS_ALERTA = {
  pendiente: { label: 'Sin asignar', color: '#D32F2F' },
  asignada: { label: 'Asignada', color: '#ED6C02' },
  mitigada: { label: 'Mitigada', color: '#2E7D32' },
};

export const textoParametro = (parametro) => ETIQUETAS_PARAMETRO[parametro] || parametro;

export const textoValor = (parametro, valor) =>
  valor === null || valor === undefined ? 'Sin dato' : `${Number(valor)}${UNIDADES_PARAMETRO[parametro] || ''}`;

export const formatearFecha = (fecha) => (fecha ? new Date(fecha).toLocaleString() : '—');

// Evento del navegador para avisar que una alerta cambió (se asignó, se
// mitigó o llegó una nueva), así el contador del menú y la lista de
// Notificaciones se actualizan al instante, sin esperar al siguiente ciclo.
export const EVENTO_ALERTAS_CAMBIARON = 'yakuzone:alertas-cambiaron';
export const avisarCambioAlertas = () => window.dispatchEvent(new Event(EVENTO_ALERTAS_CAMBIARON));
