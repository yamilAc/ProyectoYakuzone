"""Modelo de pronóstico de series temporales: compara persistencia (modelo
base), ARIMA y Prophet para pH, turbidez y conductividad, a 3 horas.

Datos: serie real de USGS (descargar_usgs.py) en promedios de 15 minutos.
  - julio: elección del orden (p, d, q) de ARIMA para cada parámetro (AIC);
  - agosto (validación): elección del mejor método para cada parámetro (MAE);
  - septiembre y octubre (prueba): MAE y RMSE finales, con datos no vistos.
En cada fecha de evaluación, los modelos se ajustan solo con los 7 días
anteriores (origen móvil), igual que lo hará el microservicio en operación.

Uso (desde la carpeta ml/):
    .venv/Scripts/python -m entrenamiento.pronostico
Genera modelos/pronostico.joblib, reportes/pronostico.json y figuras.
"""

import time
import warnings

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from entrenamiento.comun import ETIQUETAS, MODELOS, SEMILLA, UMBRALES, cargar_usgs, guardar_figura, guardar_reporte, preparar_carpetas
from nucleo.pronostico import (
    FRECUENCIA,
    METODOS,
    PARAMETROS_PRONOSTICO,
    PASOS,
    historia_reciente,
    preparar_serie,
    pronosticar,
    suficiente,
)

ORDENES = [(1, 0, 0), (2, 0, 0), (1, 0, 1), (2, 0, 1), (0, 1, 1), (1, 1, 0), (1, 1, 1), (2, 1, 1)]
INICIO_VALIDACION = pd.Timestamp('2026-08-01')
INICIO_PRUEBA = pd.Timestamp('2026-09-01')
FIN = pd.Timestamp('2026-11-01')
ORIGENES_VALIDACION = 30
ORIGENES_PRUEBA = 60
HORIZONTES = {'1 h': 4, '2 h': 8, '3 h': 12}


def elegir_orden(y, parametro):
    """Orden de ARIMA con menor AIC promedio en 3 ventanas de 7 días de julio."""
    from statsmodels.tsa.arima.model import ARIMA

    from nucleo.pronostico import fourier

    finales = [pd.Timestamp('2026-07-10'), pd.Timestamp('2026-07-20'), pd.Timestamp('2026-07-31')]
    resultados = {}
    for orden in ORDENES:
        aic = []
        for fin in finales:
            ventana = historia_reciente(y, fin)
            try:
                ajuste = ARIMA(ventana, order=orden, exog=fourier(ventana.index), trend='c' if orden[1] == 0 else 'n').fit()
                aic.append(ajuste.aic)
            except Exception:  # noqa: BLE001 - un orden que no converge simplemente se descarta
                aic.append(np.inf)
        resultados[str(orden)] = float(np.mean(aic))
    mejor = min(ORDENES, key=lambda o: resultados[str(o)])
    print(f'  {parametro}: orden ARIMA elegido {mejor}')
    return mejor, resultados


def origenes(y, desde, hasta, cantidad, semilla):
    """Fechas al azar (reproducibles) con 7 días de historia y 3 h de futuro reales."""
    rng = np.random.default_rng(semilla)
    candidatos = y[(y.index >= desde) & (y.index < hasta - pd.Timedelta(hours=3))].index
    elegidos = []
    for t in rng.permutation(candidatos):
        futuro = y[(y.index > t) & (y.index <= t + pd.Timedelta(hours=3))]
        if len(futuro) == PASOS and futuro.notna().all() and suficiente(historia_reciente(y, t)):
            elegidos.append(pd.Timestamp(t))
        if len(elegidos) == cantidad:
            break
    return sorted(elegidos)


def evaluar(y, parametro, fechas, orden):
    """Errores absolutos y cuadráticos de cada método en cada paso del horizonte."""
    errores = {m: [] for m in METODOS}
    tiempos = {m: 0.0 for m in METODOS}
    for t in fechas:
        historia = historia_reciente(y, t)
        real = y[(y.index > t) & (y.index <= t + pd.Timedelta(hours=3))].values
        for metodo in METODOS:
            inicio = time.perf_counter()
            prediccion = pronosticar(historia, parametro, metodo, orden)
            tiempos[metodo] += time.perf_counter() - inicio
            errores[metodo].append(prediccion - real)
    return {m: np.array(e) for m, e in errores.items()}, {m: tiempos[m] / max(1, len(fechas)) for m in METODOS}


def resumir(errores):
    resumen = {}
    for metodo, e in errores.items():
        fila = {}
        for nombre, paso in HORIZONTES.items():
            fila[f'mae_{nombre}'] = round(float(np.mean(np.abs(e[:, paso - 1]))), 4)
            fila[f'rmse_{nombre}'] = round(float(np.sqrt(np.mean(e[:, paso - 1] ** 2))), 4)
        fila['mae_promedio'] = round(float(np.mean(np.abs(e))), 4)
        fila['rmse_promedio'] = round(float(np.sqrt(np.mean(e**2))), 4)
        resumen[metodo] = fila
    return resumen


def main():
    # Al probar varios órdenes de ARIMA es normal que algunos no converjan del
    # todo: esas advertencias no aportan y llenan la salida.
    warnings.filterwarnings('ignore')
    preparar_carpetas()
    serie = cargar_usgs()
    configuracion = {}
    reporte = {}
    ejemplos = {}

    for i, parametro in enumerate(PARAMETROS_PRONOSTICO):
        print(f'== {parametro} ==')
        y = preparar_serie(serie, parametro)
        orden, aic = elegir_orden(y, parametro)

        fechas_val = origenes(y, INICIO_VALIDACION, INICIO_PRUEBA, ORIGENES_VALIDACION, SEMILLA + i)
        errores_val, _ = evaluar(y, parametro, fechas_val, orden)
        resumen_val = resumir(errores_val)
        elegido = min(METODOS, key=lambda m: resumen_val[m]['mae_promedio'])
        print(f'  validación (MAE promedio): ' + ', '.join(f'{m} {resumen_val[m]["mae_promedio"]}' for m in METODOS) + f' -> {elegido}')

        fechas_prueba = origenes(y, INICIO_PRUEBA, FIN, ORIGENES_PRUEBA, SEMILLA + 10 + i)
        errores_prueba, tiempos = evaluar(y, parametro, fechas_prueba, orden)
        resumen_prueba = resumir(errores_prueba)
        base = resumen_prueba['persistencia']['mae_promedio']
        mejora = {m: round(100 * (base - resumen_prueba[m]['mae_promedio']) / base, 1) if base else None for m in METODOS}
        print(f'  prueba (MAE promedio): ' + ', '.join(f'{m} {resumen_prueba[m]["mae_promedio"]}' for m in METODOS))

        configuracion[parametro] = {'metodo': elegido, 'orden_arima': list(orden)}
        reporte[parametro] = {
            'orden_arima': list(orden),
            'aic_por_orden': aic,
            'metodo_elegido': elegido,
            'validacion': resumen_val,
            'prueba': resumen_prueba,
            'mejora_vs_persistencia_pct': mejora,
            'segundos_por_pronostico': {m: round(t, 3) for m, t in tiempos.items()},
            'origenes_prueba': len(fechas_prueba),
            'limite_nb512': UMBRALES.get(parametro),
        }
        ejemplos[parametro] = (y, fechas_prueba[len(fechas_prueba) // 2], orden)

    joblib.dump(
        {'parametros': configuracion, 'frecuencia': FRECUENCIA, 'pasos': PASOS, 'entrenado_con': 'USGS 01646500 (2026)'},
        MODELOS / 'pronostico.joblib',
    )
    guardar_reporte(
        'pronostico',
        {
            'modelo': 'Persistencia (base), ARIMA con ciclo diario (Fourier) y Prophet',
            'datos': {
                'fuente': 'USGS 01646500 - Potomac River near Washington DC, Little Falls Pump (promedios de 15 min)',
                'seleccion_orden_arima': 'julio 2026',
                'validacion': 'agosto 2026',
                'prueba': 'septiembre y octubre 2026',
                'historia_por_pronostico': '7 días',
                'horizonte': '3 horas (12 pasos de 15 min)',
            },
            'parametros': reporte,
        },
    )
    graficar(reporte, ejemplos)


def graficar(reporte, ejemplos):
    figura, ejes = plt.subplots(1, len(PARAMETROS_PRONOSTICO), figsize=(13, 4))
    colores = {'persistencia': '#9e9e9e', 'arima': '#0E7C9B', 'prophet': '#ED6C02'}
    for eje, parametro in zip(ejes, PARAMETROS_PRONOSTICO):
        prueba = reporte[parametro]['prueba']
        posiciones = np.arange(len(HORIZONTES))
        for k, metodo in enumerate(METODOS):
            valores = [prueba[metodo][f'mae_{h}'] for h in HORIZONTES]
            eje.bar(posiciones + (k - 1) * 0.27, valores, width=0.27, color=colores[metodo], label=metodo.capitalize())
        eje.set_xticks(posiciones, list(HORIZONTES))
        eje.set_title(ETIQUETAS[parametro])
        eje.set_xlabel('Horizonte')
    ejes[0].set_ylabel('MAE (datos de prueba)')
    ejes[0].legend()
    figura.suptitle('Error absoluto medio del pronóstico por método y horizonte')
    guardar_figura(figura, 'pronostico_mae')

    figura, ejes = plt.subplots(len(PARAMETROS_PRONOSTICO), 1, figsize=(11, 9))
    for eje, parametro in zip(ejes, PARAMETROS_PRONOSTICO):
        y, t, orden = ejemplos[parametro]
        historia = historia_reciente(y, t)
        real = y[(y.index > t) & (y.index <= t + pd.Timedelta(hours=3))]
        visible = historia[historia.index > t - pd.Timedelta(hours=24)]
        eje.plot(visible.index, visible.values, color='#263238', linewidth=1, label='Historia (últimas 24 h)')
        eje.plot(real.index, real.values, color='#263238', linestyle=':', linewidth=1.5, label='Valor real')
        for metodo in METODOS:
            eje.plot(real.index, pronosticar(historia, parametro, metodo, orden), color=colores[metodo], linewidth=1.8, label=metodo.capitalize())
        eje.set_ylabel(ETIQUETAS[parametro])
    ejes[0].legend(fontsize=8, ncol=5, loc='upper left')
    figura.suptitle('Ejemplo de pronóstico a 3 horas (datos de prueba)')
    guardar_figura(figura, 'pronostico_ejemplo')


if __name__ == '__main__':
    main()
