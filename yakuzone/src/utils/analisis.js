// Constantes de la página de Análisis y de las alertas preventivas: los
// resultados del servicio de aprendizaje automático (carpeta ml/ del proyecto).

// Clase de calidad del agua que asigna el modelo de clasificación.
export const CLASES_CALIDAD = {
  apta: { label: 'Apta', color: '#2E7D32' },
  en_riesgo: { label: 'En riesgo', color: '#ED6C02' },
  no_apta: { label: 'No apta', color: '#D32F2F' },
};

// Causa probable de una lectura anómala (nucleo/anomalias.py -> diagnosticar).
export const TIPOS_ANOMALIA = {
  lectura_congelada: { label: 'Lectura congelada', detalle: 'El sensor repite los mismos valores (posible falla del nodo)' },
  pico_aislado: { label: 'Pico aislado', detalle: 'Un parámetro salta de golpe en una sola lectura (posible ruido o falla)' },
  variacion_real: { label: 'Variación real', detalle: 'Varios parámetros cambian a la vez (posible cambio real del agua)' },
  deriva: { label: 'Deriva', detalle: 'Un parámetro se aleja de a poco de su nivel (posible descalibración)' },
  atipica: { label: 'Atípica', detalle: 'Comportamiento inusual sin un patrón claro' },
};

export const METODOS_PRONOSTICO = {
  persistencia: 'Persistencia',
  arima: 'ARIMA',
  prophet: 'Prophet',
};

export const NOMBRES_PARAMETRO = {
  temperatura: 'Temperatura',
  conductividad: 'Conductividad',
  ph: 'pH',
  turbidez: 'Turbidez',
};

// Color de las alertas preventivas: distinto del de las alertas normativas.
export const COLOR_PREVENTIVA = '#1565C0';

export const ORIGENES_PREVENTIVA = {
  anomalia: { label: 'Lectura anómala' },
  pronostico: { label: 'Pronóstico fuera de rango' },
};

export const porcentaje = (valor, decimales = 0) =>
  valor === null || valor === undefined ? '—' : `${(Number(valor) * 100).toFixed(decimales)} %`;
