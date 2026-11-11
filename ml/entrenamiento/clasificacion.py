"""Modelo de clasificación supervisada de la calidad del agua: compara
regresión logística (modelo base), Random Forest y XGBoost.

Datos: muestras de laboratorio reales del Water Quality Portal (USGS y EPA)
de 27 estaciones de ríos de EE. UU. (descargar_wqp.py), etiquetadas con el
índice de cumplimiento de la NB 512-04 en los parámetros que requieren
laboratorio (indice_calidad.py): apta / en riesgo / no apta. Entradas: solo lo
que mide el nodo (pH, conductividad, turbidez y temperatura).

Procedimiento:
  1. División estratificada: 80 % para entrenar y 20 % reservado para la
     prueba final (datos que los modelos nunca ven al entrenarse).
  2. En el 80 %: búsqueda de hiperparámetros y métricas con validación
     cruzada estratificada de 5 particiones (exactitud, precisión,
     sensibilidad y F1, promedio macro de las tres clases).
  3. Se elige el modelo con mejor F1 en validación cruzada; se evalúan los
     tres con el 20 % reservado (matriz de confusión y curvas ROC).
  4. Prueba más exigente: validación dejando estaciones completas fuera
     (ríos que el modelo no vio).
  5. Contraste con la regla de la NB 512-04 aplicada a lo que mide el sensor.
  6. Se documenta por qué se descartó el conjunto de Kadiwal (2021).

Uso (desde la carpeta ml/):
    .venv/Scripts/python -m entrenamiento.clasificacion
Genera modelos/clasificador.joblib, reportes/clasificacion.json y figuras.
"""

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    RocCurveDisplay,
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, GroupKFold, StratifiedKFold, cross_val_predict, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from entrenamiento.comun import DATOS, MODELOS, SEMILLA, cargar_lecturas_bd, guardar_figura, guardar_reporte, preparar_carpetas
from entrenamiento.indice_calidad import ENTRADAS, LIMITES_LABORATORIO, UMBRAL_RIESGO, etiquetar, preparar_muestras
from nucleo.clasificacion import CLASES, UMBRALES_NB512, preparar_entradas

NOMBRES = {'regresion_logistica': 'Regresión logística', 'random_forest': 'Random Forest', 'xgboost': 'XGBoost'}
ETIQUETAS_CLASE = {'apta': 'Apta', 'en_riesgo': 'En riesgo', 'no_apta': 'No apta'}
NOMBRES_VARIABLE = {'ph': 'pH', 'log_conductividad': 'Conductividad (log)', 'log_turbidez': 'Turbidez (log)', 'temperatura': 'Temperatura'}
METRICAS_CV = {
    'exactitud': 'accuracy',
    'precision': 'precision_macro',
    'sensibilidad': 'recall_macro',
    'f1': 'f1_macro',
    'auc_roc': 'roc_auc_ovr',
}


def candidatos():
    return {
        'regresion_logistica': (
            Pipeline([('escalar', StandardScaler()), ('modelo', LogisticRegression(class_weight='balanced', max_iter=5000))]),
            {'modelo__C': [0.01, 0.1, 1, 10]},
        ),
        'random_forest': (
            Pipeline([('modelo', RandomForestClassifier(n_estimators=300, class_weight='balanced', random_state=SEMILLA, n_jobs=-1))]),
            {'modelo__max_depth': [6, 10, None], 'modelo__min_samples_leaf': [1, 3, 10]},
        ),
        # XGBoost no tiene class_weight: el balance de clases se da con pesos por muestra.
        'xgboost': (
            Pipeline([('modelo', XGBClassifier(objective='multi:softprob', eval_metric='mlogloss', subsample=0.8, random_state=SEMILLA, n_jobs=-1))]),
            {'modelo__max_depth': [3, 5, 7], 'modelo__learning_rate': [0.05, 0.1], 'modelo__n_estimators': [200, 400]},
        ),
    }


def metricas(y, prediccion, probabilidades=None):
    resultado = {
        'exactitud': round(accuracy_score(y, prediccion), 4),
        'precision': round(precision_score(y, prediccion, average='macro', zero_division=0), 4),
        'sensibilidad': round(recall_score(y, prediccion, average='macro', zero_division=0), 4),
        'f1': round(f1_score(y, prediccion, average='macro', zero_division=0), 4),
        'auc_roc': round(roc_auc_score(y, probabilidades, multi_class='ovr', labels=[0, 1, 2]), 4) if probabilidades is not None else None,
        'por_clase': {},
        'matriz_confusion': confusion_matrix(y, prediccion, labels=[0, 1, 2]).tolist(),
    }
    for i, clase in enumerate(CLASES):
        resultado['por_clase'][clase] = {
            'precision': round(precision_score(y, prediccion, labels=[i], average='macro', zero_division=0), 4),
            'sensibilidad': round(recall_score(y, prediccion, labels=[i], average='macro', zero_division=0), 4),
            'f1': round(f1_score(y, prediccion, labels=[i], average='macro', zero_division=0), 4),
        }
    return resultado


def regla_nb512(datos):
    """Clase que daría la NB 512-04 aplicada solo a lo que mide el sensor:
    no apta si algo está fuera de rango y, si no, apta (el sensor no ve los
    parámetros de laboratorio)."""
    fuera = np.zeros(len(datos), dtype=bool)
    for parametro, (minimo, maximo) in UMBRALES_NB512.items():
        fuera |= (datos[parametro] < minimo) | (datos[parametro] > maximo)
    return np.where(fuera, CLASES.index('no_apta'), CLASES.index('apta'))


def diagnostico_kaggle():
    """Por qué se descartó el conjunto de Kadiwal (2021): sus etiquetas de
    potabilidad no se pueden predecir con las variables que mide el nodo."""
    ruta = DATOS / 'water_potability.csv'
    if not ruta.exists():
        return None
    from sklearn.impute import SimpleImputer
    from sklearn.model_selection import cross_val_score
    from sklearn.pipeline import make_pipeline

    d = pd.read_csv(ruta)
    y = d['Potability']
    cv = StratifiedKFold(5, shuffle=True, random_state=SEMILLA)

    def auc(columnas):
        modelo = make_pipeline(SimpleImputer(strategy='median'), RandomForestClassifier(300, min_samples_leaf=5, random_state=SEMILLA, n_jobs=-1))
        return round(float(cross_val_score(modelo, d[columnas], y, cv=cv, scoring='roc_auc').mean()), 4)

    return {
        'fuente': 'Kadiwal (2021). Water Potability, Kaggle',
        'muestras': int(len(d)),
        'auc_con_variables_del_nodo': auc(['ph', 'Conductivity', 'Turbidity']),
        'auc_con_las_9_variables': auc([c for c in d.columns if c != 'Potability']),
        'solidos_disueltos_promedio_mg_l': round(float(d['Solids'].mean()), 1),
        'potables_con_ph_fuera_de_6_5_a_9': int((((d.ph < 6.5) | (d.ph > 9)) & (y == 1)).sum()),
        'potables_con_turbidez_mayor_a_5': int(((d.Turbidity > 5) & (y == 1)).sum()),
        'potables_total': int(y.sum()),
        'conclusion': 'Las etiquetas no se pueden predecir con las variables del nodo (AUC cercano a 0,5, igual al azar) y contradicen la '
        'normativa de agua potable, por lo que el conjunto se descartó.',
    }


def main():
    preparar_carpetas()
    muestras = etiquetar(preparar_muestras())
    x = preparar_entradas(muestras)
    y = muestras['clase'].map(CLASES.index).values
    estaciones = muestras['estacion'].values
    print(f'{len(muestras)} muestras de {muestras["estacion"].nunique()} estaciones: ' + str(muestras['clase'].value_counts().to_dict()))

    i_ent, i_prueba = train_test_split(np.arange(len(y)), test_size=0.2, stratify=y, random_state=SEMILLA)
    x_ent, x_prueba, y_ent, y_prueba = x.iloc[i_ent], x.iloc[i_prueba], y[i_ent], y[i_prueba]
    pesos = compute_sample_weight('balanced', y_ent)

    particiones = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEMILLA)
    resultados, ajustados = {}, {}
    for nombre, (modelo, grilla) in candidatos().items():
        busqueda = GridSearchCV(modelo, grilla, scoring=METRICAS_CV, refit='f1', cv=particiones, n_jobs=-1)
        extra = {'modelo__sample_weight': pesos} if nombre == 'xgboost' else {}
        busqueda.fit(x_ent, y_ent, **extra)
        i = busqueda.best_index_
        cv = {
            m: {'media': round(float(busqueda.cv_results_[f'mean_test_{m}'][i]), 4), 'desv': round(float(busqueda.cv_results_[f'std_test_{m}'][i]), 4)}
            for m in METRICAS_CV
        }
        probabilidades = busqueda.best_estimator_.predict_proba(x_prueba)
        resultados[nombre] = {
            'mejores_hiperparametros': {k.replace('modelo__', ''): v for k, v in busqueda.best_params_.items()},
            'validacion_cruzada_5': cv,
            'prueba': metricas(y_prueba, probabilidades.argmax(axis=1), probabilidades),
        }
        ajustados[nombre] = (busqueda.best_estimator_, probabilidades, extra)
        print(f'{NOMBRES[nombre]:20s} F1 CV {cv["f1"]["media"]:.3f} ± {cv["f1"]["desv"]:.3f} | F1 prueba {resultados[nombre]["prueba"]["f1"]:.3f}')

    elegido = max(resultados, key=lambda n: resultados[n]['validacion_cruzada_5']['f1']['media'])
    mejor, probabilidad, extra = ajustados[elegido]
    print(f'Modelo elegido: {NOMBRES[elegido]}')

    # Ríos que el modelo no vio: validación dejando estaciones completas fuera.
    pesos_todos = {'modelo__sample_weight': compute_sample_weight('balanced', y)} if elegido == 'xgboost' else {}
    pred_estaciones = cross_val_predict(mejor, x, y, cv=GroupKFold(5), groups=estaciones, method='predict_proba', params=pesos_todos)
    por_estacion = metricas(y, pred_estaciones.argmax(axis=1), pred_estaciones)

    regla = regla_nb512(muestras.iloc[i_prueba])
    contraste = {
        'regla_nb512_sobre_lo_medido': metricas(y_prueba, regla),
        'descripcion': 'La NB 512-04 aplicada solo a pH, turbidez y conductividad no detecta los incumplimientos de los parámetros '
        'de laboratorio; el modelo los estima a partir de esas mismas mediciones.',
    }

    importancias = None
    if hasattr(mejor.named_steps['modelo'], 'feature_importances_'):
        importancias = {v: round(float(i), 4) for v, i in zip(x.columns, mejor.named_steps['modelo'].feature_importances_)}

    aplicacion_local = None
    try:
        lecturas = cargar_lecturas_bd().dropna(subset=ENTRADAS)
        if len(lecturas):
            clases_local = mejor.predict_proba(preparar_entradas(lecturas)).argmax(axis=1)
            aplicacion_local = {'lecturas': int(len(lecturas)), 'distribucion': {c: int((clases_local == i).sum()) for i, c in enumerate(CLASES)}}
    except Exception as error:  # noqa: BLE001 - la base es opcional para entrenar
        print(f'(No se pudieron leer las lecturas del sistema: {error})')

    joblib.dump(
        {
            'modelo': mejor,
            'variables': ENTRADAS,
            'clases': CLASES,
            'algoritmo': NOMBRES[elegido],
            'entrenado_con': f'Water Quality Portal (USGS), {muestras["estacion"].nunique()} estaciones',
        },
        MODELOS / 'clasificador.joblib',
        compress=3,
    )
    conteo_estaciones = muestras.groupby('estacion').size()
    guardar_reporte(
        'clasificacion',
        {
            'modelo_elegido': NOMBRES[elegido],
            'criterio': 'Mayor F1 (promedio macro de las tres clases) en validación cruzada estratificada de 5 particiones',
            'datos': {
                'fuente': 'Water Quality Portal (USGS y EPA): muestras de laboratorio de ríos de EE. UU., 2000-2024',
                'estaciones': int(muestras['estacion'].nunique()),
                'muestras': int(len(muestras)),
                'muestras_por_estacion': {k: int(v) for k, v in conteo_estaciones.items()},
                'clases': {c: int((muestras['clase'] == c).sum()) for c in CLASES},
                'variables': ENTRADAS,
                'etiqueta': (
                    f'Índice de cumplimiento de la NB 512-04 en los parámetros de laboratorio ({", ".join(LIMITES_LABORATORIO)}): '
                    f'mayor razón valor / límite. Apta < {UMBRAL_RIESGO}; en riesgo entre {UMBRAL_RIESGO} y 1; no apta > 1.'
                ),
                'parametro_critico_en_no_aptas': muestras.loc[muestras['clase'] == 'no_apta', 'parametro_critico'].value_counts().to_dict(),
                'entrenamiento': int(len(i_ent)),
                'prueba': int(len(i_prueba)),
            },
            'modelos': {NOMBRES[n]: r for n, r in resultados.items()},
            'validacion_por_estacion': por_estacion,
            'contraste_nb512': contraste,
            'importancia_variables': importancias,
            'aplicacion_lecturas_del_sistema': aplicacion_local,
            'conjunto_descartado': diagnostico_kaggle(),
        },
    )
    graficar(resultados, ajustados, elegido, y_prueba, importancias)


def graficar(resultados, ajustados, elegido, y_prueba, importancias):
    figura, eje = plt.subplots(figsize=(7, 4))
    nombres = list(resultados)
    posiciones = np.arange(len(nombres))
    for k, m in enumerate(['exactitud', 'precision', 'sensibilidad', 'f1']):
        medias = [resultados[n]['validacion_cruzada_5'][m]['media'] for n in nombres]
        desv = [resultados[n]['validacion_cruzada_5'][m]['desv'] for n in nombres]
        eje.bar(posiciones + (k - 1.5) * 0.2, medias, width=0.2, yerr=desv, capsize=3, label=m.capitalize())
    eje.set_xticks(posiciones, [NOMBRES[n] for n in nombres])
    eje.set_ylim(0, 1)
    eje.set_ylabel('Promedio en validación cruzada (5 particiones)')
    eje.legend(fontsize=8, ncol=4, loc='lower center')
    eje.set_title('Comparación de modelos de clasificación')
    guardar_figura(figura, 'clasificacion_comparacion')

    figura, eje = plt.subplots(figsize=(5.5, 4.5))
    _, probabilidad, _ = ajustados[elegido]
    ConfusionMatrixDisplay.from_predictions(
        y_prueba, probabilidad.argmax(axis=1), labels=[0, 1, 2], display_labels=[ETIQUETAS_CLASE[c] for c in CLASES], cmap='Blues', ax=eje, colorbar=False
    )
    eje.set_title(f'Matriz de confusión - {NOMBRES[elegido]} (prueba)')
    eje.set_xlabel('Clase predicha')
    eje.set_ylabel('Clase real (laboratorio)')
    guardar_figura(figura, 'clasificacion_matriz_confusion')

    figura, eje = plt.subplots(figsize=(5.5, 5))
    no_apta = CLASES.index('no_apta')
    for nombre, (_, prob, _) in ajustados.items():
        RocCurveDisplay.from_predictions((y_prueba == no_apta).astype(int), prob[:, no_apta], name=NOMBRES[nombre], ax=eje)
    eje.plot([0, 1], [0, 1], linestyle='--', color='#9e9e9e', label='Azar')
    eje.set_title('Curvas ROC para "no apta" (datos de prueba)')
    guardar_figura(figura, 'clasificacion_roc')

    if importancias:
        figura, eje = plt.subplots(figsize=(5, 3))
        eje.barh([NOMBRES_VARIABLE[v] for v in importancias], list(importancias.values()), color='#0E7C9B')
        eje.set_xlabel('Importancia relativa')
        eje.set_title(f'Importancia de las variables - {NOMBRES[elegido]}')
        guardar_figura(figura, 'clasificacion_importancia')


if __name__ == '__main__':
    main()
