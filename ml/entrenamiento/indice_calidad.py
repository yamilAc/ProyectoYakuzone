"""Conjunto de datos del modelo de clasificación a partir de las muestras de
laboratorio del Water Quality Portal (descargar_wqp.py).

Cada muestra (una estación en una fecha y hora) queda con:
  - los 4 parámetros que mide el nodo IoT: pH, conductividad, turbidez y
    temperatura (las variables de entrada del modelo);
  - 5 parámetros que requieren laboratorio: nitrato, sulfato, cloruro,
    dureza total y sólidos disueltos totales.

Etiqueta: índice de cumplimiento de la NB 512-04 en los parámetros de
laboratorio, igual a la mayor razón valor / valor máximo aceptable entre
ellos (1 = justo en el límite):
  - apta:       todos por debajo del 75 % de su límite;
  - en_riesgo:  alguno entre el 75 % y el 100 % de su límite;
  - no_apta:    alguno supera su límite.
Así el modelo estima, con lo que mide el sensor, lo que normalmente solo se
conoce con un análisis de laboratorio; los parámetros que el nodo sí mide se
siguen evaluando directamente con la NB 512-04.
"""

import numpy as np
import pandas as pd

from entrenamiento.comun import DATOS

ENTRADAS = ['ph', 'conductividad', 'turbidez', 'temperatura']

# Valores máximos aceptables de la NB 512-04 (3ra revisión).
LIMITES_LABORATORIO = {
    'nitrato': 45 / 4.427,  # 45 mg/L como NO3- = 10,16 mg/L como N
    'sulfato': 400.0,  # mg/L
    'cloruro': 250.0,  # mg/L
    'dureza': 500.0,  # mg/L como CaCO3
    'std': 1000.0,  # sólidos disueltos totales, mg/L
}
UMBRAL_RIESGO = 0.75
NO3_A_N = 1 / 4.427  # conversión de mg/L como NO3- a mg/L como N


def preparar_muestras(ruta=None):
    """Una fila por muestra (estación + fecha y hora) con los parámetros del
    nodo y los de laboratorio, a partir de los resultados del portal."""
    ruta = ruta or DATOS / 'wqp_muestras.csv'
    if not ruta.exists():
        raise SystemExit(f'Falta {ruta}: ejecuta primero entrenamiento/descargar_wqp.py')
    d = pd.read_csv(ruta, low_memory=False)
    d['valor'] = pd.to_numeric(d['ResultMeasureValue'], errors='coerce')
    d['muestra'] = (
        d['MonitoringLocationIdentifier'] + '|' + d['ActivityStartDate'] + ' ' + d['ActivityStartTime/Time'].fillna('00:00:00')
    )
    caracteristica = d['CharacteristicName']
    unidad = d['ResultMeasure/MeasureUnitCode'].fillna('')
    fraccion = d['ResultSampleFractionText'].fillna('')
    d.loc[(caracteristica == 'Nitrate') & (unidad == 'mg/l asNO3'), 'valor'] *= NO3_A_N

    seleccion = {
        'ph': caracteristica == 'pH',
        'conductividad': caracteristica == 'Specific conductance',
        'turbidez': (caracteristica == 'Turbidity') & unidad.isin(['FNU', 'NTU', 'NTRU']),
        'temperatura': caracteristica == 'Temperature, water',
        'nitrato': (caracteristica == 'Nitrate') & (fraccion == 'Dissolved') & unidad.isin(['mg/l as N', 'mg/l asNO3']),
        'nitrato_nitrito': (caracteristica == 'Inorganic nitrogen (nitrate and nitrite)') & (fraccion == 'Dissolved'),
        'sulfato': caracteristica == 'Sulfate',
        'cloruro': caracteristica == 'Chloride',
        'dureza': caracteristica == 'Hardness, Ca, Mg',
        'std': (caracteristica == 'Total dissolved solids') & (unidad == 'mg/l'),
    }
    muestras = pd.concat([d[m].groupby('muestra')['valor'].mean().rename(n) for n, m in seleccion.items()], axis=1)
    # Si no se informó el nitrato solo, se usa nitrato + nitrito (el nitrito es mínimo)
    muestras['nitrato'] = muestras['nitrato'].fillna(muestras['nitrato_nitrito'])
    muestras = muestras.drop(columns='nitrato_nitrito')
    partes = muestras.index.str.split('|')
    muestras['estacion'] = partes.str[0]
    muestras['fecha'] = pd.to_datetime(partes.str[1], errors='coerce')
    return muestras.reset_index(drop=True)


def etiquetar(muestras, minimo_laboratorio=4):
    """Muestras con los 4 parámetros del nodo y al menos `minimo_laboratorio`
    de los 5 de laboratorio, con su índice de cumplimiento y su clase."""
    completas = muestras[
        muestras[ENTRADAS].notna().all(axis=1) & (muestras[list(LIMITES_LABORATORIO)].notna().sum(axis=1) >= minimo_laboratorio)
    ].copy()
    razones = pd.concat([completas[p] / limite for p, limite in LIMITES_LABORATORIO.items()], axis=1)
    razones.columns = list(LIMITES_LABORATORIO)
    completas['indice'] = razones.max(axis=1)
    completas['parametro_critico'] = razones.idxmax(axis=1)
    completas['clase'] = np.where(
        completas['indice'] > 1, 'no_apta', np.where(completas['indice'] > UMBRAL_RIESGO, 'en_riesgo', 'apta')
    )
    return completas.reset_index(drop=True)
