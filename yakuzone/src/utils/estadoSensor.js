import L from 'leaflet';

// Mismos umbrales que utils/thresholds.js del backend (NB 512-04). Además
// de los límites duros (rojo = fuera de rango), se define un margen de
// advertencia cerca de cada límite (amarillo), para poder anticipar un
// problema antes de que se convierta en alerta.
export const UMBRALES = {
  valor_ph: { min: 6.5, max: 9.0 },
  valor_turbidez: { min: 0, max: 5 },
  valor_conductividad: { min: 0, max: 1500 },
};

const MARGEN_ADVERTENCIA = 0.1; // 10% del ancho del rango, hacia cada lado

export const COLORES_ESTADO = {
  verde: '#2E7D32',
  amarillo: '#ED6C02',
  rojo: '#D32F2F',
  info: '#0E7C9B',
};

export const ETIQUETAS_ESTADO = {
  verde: 'Normal',
  amarillo: 'Advertencia',
  rojo: 'Alerta',
};

// Devuelve 'rojo' | 'amarillo' | 'verde' | null (sin datos aún) para una
// lectura. La temperatura no tiene umbral normado, así que no participa del
// cálculo (igual que en el backend).
export const evaluarEstadoSensor = (lectura) => {
  if (!lectura) return null;

  let estado = 'verde';
  for (const campo of Object.keys(UMBRALES)) {
    const valor = Number(lectura[campo]);
    if (Number.isNaN(valor)) continue;

    const { min, max } = UMBRALES[campo];
    if (valor < min || valor > max) {
      return 'rojo'; // el peor caso posible, no hace falta seguir revisando
    }

    const margen = (max - min) * MARGEN_ADVERTENCIA;
    if (valor < min + margen || valor > max - margen) {
      estado = 'amarillo';
    }
  }
  return estado;
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

    const { min, max } = UMBRALES[campo];
    const margen = (max - min) * MARGEN_ADVERTENCIA;

    let estado = 'verde';
    let clave = 'verde';
    if (valorNum < min) {
      estado = 'rojo';
      clave = 'rojo_bajo';
    } else if (valorNum > max) {
      estado = 'rojo';
      clave = 'rojo_alto';
    } else if (valorNum < min + margen) {
      estado = 'amarillo';
      clave = 'amarillo_bajo';
    } else if (valorNum > max - margen) {
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
