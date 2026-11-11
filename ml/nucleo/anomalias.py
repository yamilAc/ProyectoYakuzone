"""Variables derivadas y diagnóstico del modelo de detección de anomalías
(Isolation Forest). Lo usan tanto el entrenamiento (entrenamiento/anomalias.py)
como el microservicio, para que ambos calculen exactamente lo mismo.

Las variables no usan los valores absolutos de cada parámetro sino cambios
relativos (respecto a la lectura anterior, a la última hora y a las últimas 6
horas), de modo que un modelo entrenado con una fuente de agua sirva para otra
con otros niveles. Las ventanas se miden en minutos y no en cantidad de
lecturas, para que funcionen igual con lecturas cada 5 segundos o cada 5
minutos.
"""

import numpy as np
import pandas as pd

PARAMETROS = ['temperatura', 'conductividad', 'ph', 'turbidez']

# Resolución típica de medición de cada parámetro: evita dividir por una
# desviación casi nula cuando la señal está quieta.
RESOLUCION = {'temperatura': 0.1, 'conductividad': 1.0, 'ph': 0.05, 'turbidez': 0.1}

VENTANA_CORTA = '60min'
VENTANA_LARGA = '6h'
MAX_MINUTOS_CONGELADO = 240

# Umbrales del diagnóstico (en desviaciones respecto de la última hora).
DESVIACION_FUERTE = 4.0
DESVIACION_LEVE = 2.0
MINUTOS_PARA_CONGELADA = 30


def columnas_caracteristicas():
    columnas = []
    for p in PARAMETROS:
        columnas += [f'{p}_cambio', f'{p}_desv_1h', f'{p}_deriva_6h']
    return columnas + ['minutos_congelado']


def calcular_caracteristicas(serie):
    """serie: DataFrame indexado por fecha_hora (ordenado) con las columnas de
    PARAMETROS. Devuelve un DataFrame con las variables de cada lectura; las
    primeras lecturas sin historia suficiente quedan con NaN."""
    s = serie[PARAMETROS].astype(float).interpolate(limit=3, limit_direction='forward')
    variables = {}
    for p in PARAMETROS:
        x = s[p]
        eps = RESOLUCION[p]
        anterior = x.shift(1)
        media_1h = x.rolling(VENTANA_CORTA, closed='left', min_periods=3).mean()
        desv_1h = x.rolling(VENTANA_CORTA, closed='left', min_periods=3).std()
        mediana_6h = x.rolling(VENTANA_LARGA, closed='left', min_periods=6).median()
        desv_6h = x.rolling(VENTANA_LARGA, closed='left', min_periods=6).std()
        escala_6h = desv_6h.fillna(0) + eps
        variables[f'{p}_cambio'] = (x - anterior).abs() / escala_6h
        variables[f'{p}_desv_1h'] = (x - media_1h).abs() / (desv_1h.fillna(0) + eps)
        variables[f'{p}_deriva_6h'] = (media_1h - mediana_6h).abs() / escala_6h

    # Minutos desde que alguno de los parámetros cambió por última vez: si
    # todos quedan idénticos mucho tiempo, el nodo envía lecturas congeladas.
    sin_cambios = s.diff().abs().sum(axis=1, min_count=1).fillna(1) == 0
    grupo = (~sin_cambios).cumsum()
    inicio = s.index.to_series().groupby(grupo.values).transform('first')
    minutos = (s.index.to_series() - inicio).dt.total_seconds() / 60
    variables['minutos_congelado'] = minutos.clip(upper=MAX_MINUTOS_CONGELADO).values

    return pd.DataFrame(variables, index=s.index)[columnas_caracteristicas()]


def diagnosticar(variables):
    """A partir de las variables de una lectura marcada como anómala, sugiere
    su causa probable, para diferenciar fallas del sensor de variaciones
    reales del agua:
      - lectura_congelada: el nodo repite exactamente los mismos valores;
      - pico_aislado: un solo parámetro salta de golpe (ruido o falla puntual);
      - variacion_real: varios parámetros cambian a la vez (p. ej. turbidez y
        conductividad con una lluvia), lo que apunta a un cambio del agua;
      - deriva: un parámetro se aleja de a poco de su nivel habitual (posible
        descalibración del sensor);
      - atipica: comportamiento inusual sin un patrón claro.
    Devuelve (tipo, parametros_involucrados)."""
    if variables.get('minutos_congelado', 0) >= MINUTOS_PARA_CONGELADA:
        return 'lectura_congelada', list(PARAMETROS)

    fuertes = [p for p in PARAMETROS if max(variables.get(f'{p}_desv_1h', 0), variables.get(f'{p}_cambio', 0)) >= DESVIACION_FUERTE]
    leves = [p for p in PARAMETROS if variables.get(f'{p}_desv_1h', 0) >= DESVIACION_LEVE]
    if len(fuertes) == 1 and len(leves) <= 1:
        return 'pico_aislado', fuertes
    if len(leves) >= 2:
        return 'variacion_real', leves
    derivas = [p for p in PARAMETROS if variables.get(f'{p}_deriva_6h', 0) >= DESVIACION_LEVE]
    if derivas:
        return 'deriva', derivas
    return 'atipica', fuertes or leves


def es_anomala(puntaje, umbral, minutos_congelado):
    """Decisión final de anomalía: el puntaje de Isolation Forest supera el
    umbral, o el sensor lleva al menos MINUTOS_PARA_CONGELADA minutos enviando
    exactamente los mismos valores (regla de calidad de datos: un sensor
    congelado es una condición exacta, no algo que haya que estimar)."""
    return np.logical_or(np.asarray(puntaje) <= umbral, np.asarray(minutos_congelado) >= MINUTOS_PARA_CONGELADA)


def puntaje_a_escala(puntajes, umbral):
    """Convierte el puntaje de Isolation Forest (decision_function: más bajo =
    más anómalo) en un valor de 0 a 1 fácil de mostrar (1 = muy anómalo),
    donde 0.5 corresponde al umbral elegido."""
    puntajes = np.asarray(puntajes, dtype=float)
    return 1 / (1 + np.exp((puntajes - umbral) * 25))
