import L from 'leaflet';

// Estado de cada sensor en tiempo real, calculado con su última lectura (el
// Dashboard, Zonas y Sensores la vuelven a pedir cada 10 segundos).
// Mismos umbrales que utils/thresholds.js del backend (NB 512-04). Además
// de los límites duros (rojo = fuera de rango), se define un margen de
// advertencia cerca de cada límite (amarillo), para poder anticipar un
// problema antes de que se convierta en alerta. Si el sensor deja de enviar
// lecturas, su último estado ya no representa el agua: se muestra "Sin
// conexión" en vez de dejarlo congelado.
export const UMBRALES = {
  valor_ph: { min: 6.5, max: 9.0 },
  valor_turbidez: { min: 0, max: 5 },
  valor_conductividad: { min: 0, max: 1500 },
};

const MARGEN_ADVERTENCIA = 0.1; // 10% del ancho del rango, hacia cada lado

// Minutos sin lecturas a partir de los cuales el sensor se considera sin
// conexión (el prototipo envía una lectura cada pocos segundos).
export const MINUTOS_SIN_CONEXION = 5;

export const esLecturaReciente = (lectura) =>
  Boolean(lectura) && Date.now() - new Date(lectura.fecha_hora).getTime() <= MINUTOS_SIN_CONEXION * 60 * 1000;

// Cerca de un límite real: el mínimo solo cuenta si es mayor que 0 (pH); en
// turbidez y conductividad el mínimo es 0, que es agua limpia, no un riesgo.
const cercaDelMinimo = (valor, { min, max }) => min > 0 && valor < min + (max - min) * MARGEN_ADVERTENCIA;
const cercaDelMaximo = (valor, { min, max }) => valor > max - (max - min) * MARGEN_ADVERTENCIA;

export const COLORES_ESTADO = {
  verde: '#2E7D32',
  amarillo: '#ED6C02',
  rojo: '#D32F2F',
  desconectado: '#9e9e9e',
  info: '#0E7C9B',
};

export const ETIQUETAS_ESTADO = {
  verde: 'Normal',
  amarillo: 'Advertencia',
  rojo: 'Alerta',
  desconectado: 'Sin conexión',
};

// Estados que se muestran en las leyendas de los mapas.
export const LEYENDA_ESTADOS = ['verde', 'amarillo', 'rojo', 'desconectado'];

// Devuelve 'rojo' | 'amarillo' | 'verde' | 'desconectado' (la última lectura
// tiene más de MINUTOS_SIN_CONEXION) | null (sin lecturas aún). La
// temperatura no tiene umbral normado, así que no participa del cálculo
// (igual que en el backend).
export const evaluarEstadoSensor = (lectura) => {
  if (!lectura) return null;
  if (!esLecturaReciente(lectura)) return 'desconectado';

  let estado = 'verde';
  for (const campo of Object.keys(UMBRALES)) {
    const valor = Number(lectura[campo]);
    if (Number.isNaN(valor)) continue;

    const umbral = UMBRALES[campo];
    if (valor < umbral.min || valor > umbral.max) {
      return 'rojo'; // el peor caso posible, no hace falta seguir revisando
    }
    if (cercaDelMinimo(valor, umbral) || cercaDelMaximo(valor, umbral)) {
      estado = 'amarillo';
    }
  }
  return estado;
};

// "hace 2 min" si la lectura es reciente; si no, la fecha y hora.
export const textoUltimaLectura = (lectura) => {
  if (!lectura) return 'Sin lecturas todavía';
  const fecha = new Date(lectura.fecha_hora);
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return 'Última lectura: hace menos de 1 min';
  if (minutos < 60) return `Última lectura: hace ${minutos} min`;
  return `Última lectura: ${fecha.toLocaleString()}`;
};

const ETIQUETAS_CAMPO = {
  valor_temperatura: { nombre: 'Temperatura', unidad: '°C' },
  valor_ph: { nombre: 'pH', unidad: '' },
  valor_turbidez: { nombre: 'Turbidez', unidad: ' NTU' },
  valor_conductividad: { nombre: 'Conductividad', unidad: ' µS/cm' },
};

const ORDEN_PARAMETROS = ['valor_temperatura', 'valor_ph', 'valor_turbidez', 'valor_conductividad'];

// Frase corta por parámetro, para el detalle del popup del mapa.
const FRASES = {
  valor_ph: {
    verde: 'pH correcto',
    rojo_bajo: 'pH bajo (ácido)',
    rojo_alto: 'pH alto (básico)',
    amarillo_bajo: 'pH cerca del límite bajo',
    amarillo_alto: 'pH cerca del límite alto',
  },
  valor_turbidez: {
    verde: 'Turbidez correcta',
    rojo_alto: 'Turbidez alta',
    amarillo_alto: 'Turbidez elevándose',
  },
  valor_conductividad: {
    verde: 'Conductividad correcta',
    rojo_alto: 'Conductividad alta',
    amarillo_alto: 'Conductividad elevándose',
  },
};

// Desglosa una lectura en sus 4 parámetros, cada uno con su propio estado y
// una frase corta ("Turbidez alta", "pH correcto", etc.), para mostrar el
// detalle de la falla al hacer click en un sensor del mapa. La temperatura
// no tiene umbral en la norma NB 512-04, así que se muestra solo como dato
// informativo, sin calificarla de correcta o incorrecta.
export const evaluarParametros = (lectura) => {
  if (!lectura) return [];

  return ORDEN_PARAMETROS.map((campo) => {
    const { nombre, unidad } = ETIQUETAS_CAMPO[campo];
    const valorNum = Number(lectura[campo]);

    if (Number.isNaN(valorNum)) {
      return { campo, nombre, unidad, valor: null, estado: null, texto: 'Sin dato' };
    }

    if (campo === 'valor_temperatura') {
      return { campo, nombre, unidad, valor: valorNum, estado: 'info', texto: 'Registrada (sin umbral normado)' };
    }

    const umbral = UMBRALES[campo];

    let estado = 'verde';
    let clave = 'verde';
    if (valorNum < umbral.min) {
      estado = 'rojo';
      clave = 'rojo_bajo';
    } else if (valorNum > umbral.max) {
      estado = 'rojo';
      clave = 'rojo_alto';
    } else if (cercaDelMinimo(valorNum, umbral)) {
      estado = 'amarillo';
      clave = 'amarillo_bajo';
    } else if (cercaDelMaximo(valorNum, umbral)) {
      estado = 'amarillo';
      clave = 'amarillo_alto';
    }

    const frasesCampo = FRASES[campo] || {};
    const texto =
      frasesCampo[clave] || (clave.startsWith('rojo') ? `${nombre} fuera de rango` : clave === 'verde' ? `${nombre} correcto/a` : `${nombre} cerca del límite`);

    return { campo, nombre, unidad, valor: valorNum, estado, texto };
  });
};

// Ícono de mapa (Leaflet) como un punto de color sólido, en vez de depender
// de imágenes de pin externas — así el color se puede calcular en runtime.
export const crearIconoEstado = (estado) => {
  const clase = estado ? `yz-marker-${estado}` : 'yz-marker-sindatos';
  return L.divIcon({
    className: 'yz-divicon',
    html: `<div class="yz-sensor-marker ${clase}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
};
