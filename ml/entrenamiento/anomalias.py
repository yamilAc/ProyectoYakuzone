"""Modelo de detección de anomalías (Isolation Forest).

Datos: serie real de USGS (descargar_usgs.py), dividida en el tiempo:
  - entrenamiento: mayo a julio (sin etiquetas: el modelo aprende lo normal);
  - validación: agosto, con anomalías inyectadas para elegir el umbral;
  - prueba: septiembre y octubre, con otras anomalías inyectadas (otra
    semilla), para medir el desempeño con datos no vistos.

Anomalías inyectadas de forma controlada (sección 7.21 del perfil):
  - pico_aislado: un parámetro salta de golpe en una sola lectura;
  - deriva: un parámetro se aleja de a poco de su nivel (descalibración);
  - lectura_congelada: el nodo repite exactamente los mismos valores.

Uso (desde la carpeta ml/):
    .venv/Scripts/python -m entrenamiento.anomalias
Genera modelos/anomalias.joblib, reportes/anomalias.json y figuras.
"""

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from entrenamiento.comun import ETIQUETAS, MODELOS, SEMILLA, cargar_usgs, guardar_figura, guardar_reporte, preparar_carpetas
from nucleo.anomalias import PARAMETROS, calcular_caracteristicas, columnas_caracteristicas, diagnosticar, es_anomala

INICIO_VALIDACION = '2026-08-01'
INICIO_PRUEBA = '2026-09-01'
TIPOS = ['pico_aislado', 'deriva', 'lectura_congelada']


def inyectar_anomalias(serie, semilla, picos=40, derivas=10, congeladas=10):
    """Devuelve (serie con anomalías, etiqueta 0/1, tipo, número de evento) sin
    tocar el original. El número de evento agrupa las lecturas de una misma
    anomalía inyectada (0 = lectura normal)."""
    rng = np.random.default_rng(semilla)
    s = serie.copy()
    n = len(s)
    paso = s.index.to_series().diff().median()
    lecturas = lambda minutos: max(1, int(pd.Timedelta(minutes=minutos) / paso))  # noqa: E731
    margen = lecturas(3 * 60)  # separación entre anomalías, para que no se mezclen sus ventanas
    escala = s.std()
    etiqueta = np.zeros(n, dtype=int)
    tipo = np.array([''] * n, dtype=object)
    evento = np.zeros(n, dtype=int)
    contador = iter(range(1, 10**6))
    ocupado = np.zeros(n, dtype=bool)

    def reservar(largo):
        for _ in range(5000):
            i = int(rng.integers(margen, n - largo - margen))
            if not ocupado[i - margen : i + largo + margen].any():
                ocupado[i - margen : i + largo + margen] = True
                return i
        raise RuntimeError('No hay espacio para inyectar más anomalías')

    col = {p: s.columns.get_loc(p) for p in PARAMETROS}

    for _ in range(picos):
        i = reservar(1)
        p = PARAMETROS[rng.integers(len(PARAMETROS))]
        signo = 1 if p == 'turbidez' else rng.choice([-1, 1])
        s.iat[i, col[p]] = max(0.0, s.iat[i, col[p]] + signo * rng.uniform(4, 8) * escala[p])
        etiqueta[i], tipo[i], evento[i] = 1, 'pico_aislado', next(contador)

    # Deriva: sube durante 4 h y vuelve en 2 h (forma de triángulo); se marcan
    # como anómalas las lecturas donde el desvío ya supera 1,5 desviaciones.
    subida, bajada = lecturas(4 * 60), lecturas(2 * 60)
    for _ in range(derivas):
        i = reservar(subida + bajada)
        p = PARAMETROS[rng.integers(len(PARAMETROS))]
        tope = rng.uniform(3, 5) * escala[p] * rng.choice([-1, 1])
        forma = np.concatenate([np.linspace(0, 1, subida), np.linspace(1, 0, bajada)])
        desvio = forma * tope
        s.iloc[i : i + subida + bajada, col[p]] = np.maximum(0.0, s.iloc[i : i + subida + bajada, col[p]].values + desvio)
        marcadas = np.abs(desvio) >= 1.5 * escala[p]
        etiqueta[i : i + subida + bajada][marcadas] = 1
        tipo[i : i + subida + bajada][marcadas] = 'deriva'
        evento[i : i + subida + bajada][marcadas] = next(contador)

    # Congelada: durante 2 h el nodo repite la misma lectura; se marcan desde
    # los 30 minutos (antes no se distingue de una señal quieta).
    largo = lecturas(2 * 60)
    desde = lecturas(30)
    for _ in range(congeladas):
        i = reservar(largo)
        s.iloc[i : i + largo] = s.iloc[i].values
        etiqueta[i + desde : i + largo] = 1
        tipo[i + desde : i + largo] = 'lectura_congelada'
        evento[i + desde : i + largo] = next(contador)

    return s, pd.Series(etiqueta, index=s.index), pd.Series(tipo, index=s.index), pd.Series(evento, index=s.index)


def evaluar(modelo, serie, semilla):
    s, etiqueta, tipo, evento = inyectar_anomalias(serie, semilla)
    variables = calcular_caracteristicas(s)
    validas = variables.notna().all(axis=1)
    variables, etiqueta, tipo, evento, s = variables[validas], etiqueta[validas], tipo[validas], evento[validas], s[validas]
    puntajes = modelo.decision_function(variables)
    return s, variables, etiqueta, tipo, evento, puntajes


MAX_FALSAS_ALARMAS = 0.01  # como máximo 1 de cada 100 lecturas normales marcadas


def elegir_umbral(etiqueta, puntajes):
    """Umbral (más bajo = más anómalo) con el mejor F1 en validación entre los
    que marcan como máximo el 1 % de las lecturas normales: en operación, un
    exceso de falsas alarmas haría que se ignoren los avisos."""
    normales = puntajes[etiqueta == 0]
    tope = np.quantile(normales, MAX_FALSAS_ALARMAS)
    candidatos = [u for u in np.quantile(puntajes, np.linspace(0.001, 0.2, 400)) if u <= tope] or [tope]
    f1 = [f1_score(etiqueta, (puntajes <= u).astype(int), zero_division=0) for u in candidatos]
    return float(candidatos[int(np.argmax(f1))])


def metricas(etiqueta, prediccion, puntajes):
    return {
        'precision': round(precision_score(etiqueta, prediccion, zero_division=0), 4),
        'sensibilidad': round(recall_score(etiqueta, prediccion, zero_division=0), 4),
        'f1': round(f1_score(etiqueta, prediccion, zero_division=0), 4),
        'auc_roc': round(roc_auc_score(etiqueta, -puntajes), 4),
        'tasa_falsas_alarmas': round(float(((prediccion == 1) & (etiqueta == 0)).sum() / max(1, (etiqueta == 0).sum())), 4),
    }


def main():
    preparar_carpetas()
    serie = cargar_usgs()
    entrenamiento = serie[serie.index < INICIO_VALIDACION]
    validacion = serie[(serie.index >= INICIO_VALIDACION) & (serie.index < INICIO_PRUEBA)]
    prueba = serie[serie.index >= INICIO_PRUEBA]

    x_entrenamiento = calcular_caracteristicas(entrenamiento).dropna()
    modelo = make_pipeline(
        StandardScaler(),
        IsolationForest(n_estimators=300, max_samples=4096, contamination='auto', random_state=SEMILLA, n_jobs=-1),
    )
    modelo.fit(x_entrenamiento)
    print(f'Entrenado con {len(x_entrenamiento)} lecturas (mayo a julio)')

    _, _, etiqueta_val, _, _, puntajes_val = evaluar(modelo, validacion, semilla=1)
    umbral = elegir_umbral(etiqueta_val.values, puntajes_val)
    pred_val = (puntajes_val <= umbral).astype(int)
    print(f'Umbral elegido en validación: {umbral:.4f}')

    s_prueba, variables_prueba, etiqueta, tipo, evento, puntajes = evaluar(modelo, prueba, semilla=2)
    # Solo el modelo y el modelo más la regla de lectura congelada (lo que usa el sistema).
    solo_modelo = metricas(etiqueta.values, (puntajes <= umbral).astype(int), puntajes)
    prediccion = es_anomala(puntajes, umbral, variables_prueba['minutos_congelado'].values).astype(int)
    resultado_prueba = metricas(etiqueta.values, prediccion, puntajes)

    por_tipo = {}
    for t in TIPOS:
        mascara = (tipo == t).values
        por_tipo[t] = {
            'lecturas_anomalas': int(mascara.sum()),
            'detectadas': int(prediccion[mascara].sum()),
            'sensibilidad': round(float(prediccion[mascara].mean()), 4),
            # Un evento (una anomalía inyectada) cuenta como detectado si el
            # modelo marcó al menos una de sus lecturas.
            'eventos': int(evento[mascara].nunique()),
            'eventos_detectados': int(evento[mascara & (prediccion == 1)].nunique()),
            'deteccion_por_evento': round(float(evento[mascara & (prediccion == 1)].nunique() / max(1, evento[mascara].nunique())), 4),
        }

    total_eventos = sum(d['eventos'] for d in por_tipo.values())
    resultado_prueba['deteccion_por_evento'] = round(sum(d['eventos_detectados'] for d in por_tipo.values()) / max(1, total_eventos), 4)
    dias = (prueba.index.max() - prueba.index.min()).total_seconds() / 86400
    resultado_prueba['falsas_alarmas_por_dia'] = round(float(((prediccion == 1) & (etiqueta.values == 0)).sum()) / dias, 2)

    # Diagnóstico de la causa en las anomalías inyectadas que se detectaron.
    aciertos = {t: {'detectadas': 0, 'diagnostico_correcto': 0} for t in TIPOS}
    for i in np.where((prediccion == 1) & (etiqueta.values == 1))[0]:
        verdadero = tipo.iat[i]
        sugerido, _ = diagnosticar(variables_prueba.iloc[i].to_dict())
        aciertos[verdadero]['detectadas'] += 1
        aciertos[verdadero]['diagnostico_correcto'] += int(sugerido == verdadero)
    for t in TIPOS:
        d = aciertos[t]
        d['exactitud'] = round(d['diagnostico_correcto'] / d['detectadas'], 4) if d['detectadas'] else None

    # Lecturas reales (no inyectadas) que el modelo marcó: no son
    # necesariamente errores, pueden ser eventos reales del río (lluvias).
    reales_marcadas = int(((prediccion == 1) & (etiqueta.values == 0)).sum())
    diagnostico_reales = {}
    for i in np.where((prediccion == 1) & (etiqueta.values == 0))[0]:
        sugerido, _ = diagnosticar(variables_prueba.iloc[i].to_dict())
        diagnostico_reales[sugerido] = diagnostico_reales.get(sugerido, 0) + 1

    joblib.dump(
        {'modelo': modelo, 'umbral': umbral, 'columnas': columnas_caracteristicas(), 'entrenado_con': 'USGS 01646500 (mayo-julio 2026)'},
        MODELOS / 'anomalias.joblib',
        compress=3,
    )

    guardar_reporte(
        'anomalias',
        {
            'modelo': 'Isolation Forest (300 árboles) con variables derivadas',
            'datos': {
                'fuente': 'USGS 01646500 - Potomac River near Washington DC, Little Falls Pump (lecturas cada 5 min)',
                'entrenamiento': f'{entrenamiento.index.min():%d/%m/%Y} a {entrenamiento.index.max():%d/%m/%Y} ({len(x_entrenamiento)} lecturas)',
                'validacion': f'{validacion.index.min():%d/%m/%Y} a {validacion.index.max():%d/%m/%Y}',
                'prueba': f'{prueba.index.min():%d/%m/%Y} a {prueba.index.max():%d/%m/%Y} ({len(variables_prueba)} lecturas)',
            },
            'variables': columnas_caracteristicas(),
            'umbral': umbral,
            'validacion': metricas(etiqueta_val.values, pred_val, puntajes_val),
            'prueba': resultado_prueba,
            'prueba_solo_modelo': solo_modelo,
            'regla_congelada': 'Además del modelo, se marca como anómala toda lectura con 30 minutos o más de valores idénticos en los cuatro parámetros',
            'prueba_por_tipo': por_tipo,
            'diagnostico_de_causa': aciertos,
            'lecturas_reales_marcadas': {'total': reales_marcadas, 'por_causa_sugerida': diagnostico_reales},
        },
    )

    graficar(s_prueba, etiqueta, prediccion, puntajes, umbral)
    print('Prueba:', resultado_prueba)
    print('Por tipo:', por_tipo)


def graficar(s, etiqueta, prediccion, puntajes, umbral):
    # Dos semanas de la prueba, con las anomalías inyectadas y las detectadas.
    desde = s.index.min() + pd.Timedelta(days=7)
    hasta = desde + pd.Timedelta(days=14)
    ventana = (s.index >= desde) & (s.index < hasta)
    figura, ejes = plt.subplots(len(PARAMETROS), 1, figsize=(12, 9), sharex=True)
    for eje, p in zip(ejes, PARAMETROS):
        x = s[ventana]
        eje.plot(x.index, x[p], color='#0E7C9B', linewidth=0.8, label='Lecturas')
        inyectadas = (etiqueta.values == 1) & ventana
        detectadas = (prediccion == 1) & ventana
        eje.scatter(s.index[inyectadas], s[p][inyectadas], s=18, facecolors='none', edgecolors='#ED6C02', label='Anomalía inyectada')
        eje.scatter(s.index[detectadas], s[p][detectadas], s=6, color='#D32F2F', label='Detectada por el modelo')
        eje.set_ylabel(ETIQUETAS[p])
    ejes[0].legend(loc='upper right', fontsize=8, ncol=3)
    ejes[-1].set_xlabel('Fecha')
    figura.suptitle('Detección de anomalías (Isolation Forest) - datos de prueba')
    guardar_figura(figura, 'anomalias_serie_prueba')

    figura, eje = plt.subplots(figsize=(8, 4))
    eje.hist(puntajes[etiqueta.values == 0], bins=80, alpha=0.7, color='#0E7C9B', label='Lecturas normales', density=True)
    eje.hist(puntajes[etiqueta.values == 1], bins=80, alpha=0.7, color='#D32F2F', label='Anomalías inyectadas', density=True)
    eje.axvline(umbral, color='black', linestyle='--', label='Umbral elegido')
    eje.set_xlabel('Puntaje de Isolation Forest (más bajo = más anómalo)')
    eje.set_ylabel('Densidad')
    eje.legend()
    guardar_figura(figura, 'anomalias_puntajes')


if __name__ == '__main__':
    main()
