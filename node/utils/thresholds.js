// Umbrales de referencia según la Norma Boliviana NB 512-04 "Agua Potable - Requisitos"
// (Ministerio de Servicios y Obras Públicas, 2004), usados por el módulo de alertas.
//
// El valor de conductividad eléctrica se estima a partir del límite de sólidos
// disueltos totales que sí figura en la norma (~1000 mg STD/L), usando la
// equivalencia aproximada habitual (STD ≈ 0.64 x conductividad en µS/cm).
// CONFIRMAR este valor con el tutor/tribunal antes de presentarlo como definitivo.
const UMBRALES = {
  ph: { min: 6.5, max: 8.5, unidad: '' },
  turbidez: { min: 0, max: 1, unidad: ' NTU' },
  conductividad: { min: 0, max: 1500, unidad: ' µS/cm' },
  // La norma no fija un valor numérico para temperatura: no se generan alertas por este parámetro.
};

const ETIQUETAS = {
  ph: 'pH',
  turbidez: 'Turbidez',
  conductividad: 'Conductividad eléctrica',
};

// Recibe un objeto con valor_ph / valor_turbidez / valor_conductividad (los
// nombres de columna usados en la tabla `lecturas`) y devuelve la lista de
// alertas que corresponde generar, si alguna.
function evaluarLectura({ valor_ph, valor_turbidez, valor_conductividad }) {
  const valores = { ph: valor_ph, turbidez: valor_turbidez, conductividad: valor_conductividad };
  const alertas = [];

  for (const parametro of Object.keys(UMBRALES)) {
    const valor = valores[parametro];
    if (valor === undefined || valor === null || Number.isNaN(Number(valor))) continue;

    const rango = UMBRALES[parametro];
    const numero = Number(valor);
    if (numero < rango.min || numero > rango.max) {
      alertas.push({
        parametro,
        valor: numero,
        tipo_alerta: `${parametro}_fuera_de_rango`,
        descripcion: `${ETIQUETAS[parametro]} = ${numero}${rango.unidad} está fuera del rango aceptable (${rango.min} - ${rango.max}${rango.unidad}) según la NB 512-04.`,
      });
    }
  }
  return alertas;
}

// Representación legible del rango de referencia de un parámetro (para
// mostrarlo en el módulo de mitigación y enviarlo como contexto a la API de
// Gemini). Ej: "6.5 - 8.5" o "0 - 1 NTU".
function rangoTexto(parametro) {
  const rango = UMBRALES[parametro];
  if (!rango) return 'No definido';
  return `${rango.min} - ${rango.max}${rango.unidad}`;
}

module.exports = { UMBRALES, ETIQUETAS, evaluarLectura, rangoTexto };
