"""Pronóstico de series temporales de los parámetros del agua: persistencia
(modelo base), ARIMA con términos de Fourier para el ciclo diario, y Prophet.
Lo usan el entrenamiento (entrenamiento/pronostico.py), que compara los tres
métodos y elige el mejor para cada parámetro, y el microservicio, que ajusta
el método elegido con la historia reciente de cada sensor."""

import logging
import warnings

import numpy as np
import pandas as pd

PARAMETROS_PRONOSTICO = ['ph', 'turbidez', 'conductividad']
FRECUENCIA = '15min'
PASOS = 12  # 12 pasos de 15 min = las próximas 3 horas
DIAS_HISTORIA = 7
MIN_PUNTOS = 2 * 96  # al menos 2 días de promedios de 15 min
PUNTOS_POR_DIA = 96
METODOS = ['persistencia', 'arima', 'prophet']

# Parámetros que no pueden ser negativos
NO_NEGATIVOS = {'turbidez', 'conductividad'}

logging.getLogger('cmdstanpy').setLevel(logging.WARNING)
logging.getLogger('prophet').setLevel(logging.WARNING)


def preparar_serie(serie, parametro):
    """Promedios de 15 minutos de un parámetro (los huecos quedan como NaN)."""
    return serie[parametro].astype(float).resample(FRECUENCIA).mean()


def historia_reciente(y, hasta=None):
    """Últimos DIAS_HISTORIA días de la serie, hasta `hasta` inclusive."""
    hasta = hasta if hasta is not None else y.index.max()
    return y[(y.index > hasta - pd.Timedelta(days=DIAS_HISTORIA)) & (y.index <= hasta)]


def suficiente(y):
    return int(y.notna().sum()) >= MIN_PUNTOS


def fechas_futuras(y, pasos=PASOS):
    return pd.date_range(y.index[-1] + pd.Timedelta(FRECUENCIA), periods=pasos, freq=FRECUENCIA)


def fourier(indice, k=2):
    """Senos y cosenos del momento del día: le permiten a ARIMA seguir el ciclo
    diario (p. ej. el pH y la temperatura suben de día y bajan de noche)."""
    dia = (indice.hour * 60 + indice.minute) / 1440.0
    columnas = {}
    for j in range(1, k + 1):
        columnas[f'sen{j}'] = np.sin(2 * np.pi * j * dia)
        columnas[f'cos{j}'] = np.cos(2 * np.pi * j * dia)
    return pd.DataFrame(columnas, index=indice)


def _recortar(parametro, valores):
    valores = np.asarray(valores, dtype=float)
    return np.maximum(valores, 0.0) if parametro in NO_NEGATIVOS else valores


def persistencia(y, pasos=PASOS):
    ultimo = y.dropna().iloc[-1]
    return np.full(pasos, ultimo, dtype=float)


def arima(y, orden, pasos=PASOS):
    from statsmodels.tsa.arima.model import ARIMA

    futuro = fechas_futuras(y, pasos)
    tendencia = 'c' if orden[1] == 0 else 'n'
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        ajuste = ARIMA(y, order=tuple(orden), exog=fourier(y.index), trend=tendencia).fit()
        return ajuste.get_forecast(pasos, exog=fourier(futuro)).predicted_mean.values


def prophet(y, pasos=PASOS):
    from prophet import Prophet

    datos = pd.DataFrame({'ds': y.index, 'y': y.values}).dropna()
    modelo = Prophet(
        daily_seasonality=True,
        weekly_seasonality=False,
        yearly_seasonality=False,
        changepoint_prior_scale=0.05,
        uncertainty_samples=0,  # solo el valor esperado: más rápido
    )
    modelo.fit(datos)
    futuro = pd.DataFrame({'ds': fechas_futuras(y, pasos)})
    return modelo.predict(futuro)['yhat'].values


def pronosticar(y, parametro, metodo, orden=None, pasos=PASOS):
    """Valores de las próximas `pasos` ventanas de 15 min con el método dado."""
    if metodo == 'arima':
        valores = arima(y, orden, pasos)
    elif metodo == 'prophet':
        valores = prophet(y, pasos)
    else:
        valores = persistencia(y, pasos)
    return _recortar(parametro, valores)
