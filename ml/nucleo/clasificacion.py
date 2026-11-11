"""Clasificación de la calidad del agua (apta / en riesgo / no apta) con el
modelo entrenado en entrenamiento/clasificacion.py. Lo usan el entrenamiento y
el microservicio.

El modelo estima, a partir de lo que mide el nodo, si los parámetros que
requieren laboratorio (nitrato, sulfato, cloruro, dureza y sólidos disueltos)
cumplen la NB 512-04. Los parámetros que el nodo sí mide se evalúan
directamente con la norma: el resultado final es el peor de los dos.
"""

import numpy as np
import pandas as pd

# Lo que mide el nodo IoT (variables de entrada del modelo).
VARIABLES = ['ph', 'conductividad', 'turbidez', 'temperatura']

CLASES = ['apta', 'en_riesgo', 'no_apta']

UMBRALES_NB512 = {'ph': (6.5, 9.0), 'turbidez': (0.0, 5.0), 'conductividad': (0.0, 1500.0)}


def preparar_entradas(datos):
    """Variables del modelo. La conductividad y la turbidez varían en órdenes
    de magnitud, por eso se usan en escala logarítmica."""
    return pd.DataFrame(
        {
            'ph': datos['ph'].astype(float),
            'log_conductividad': np.log1p(datos['conductividad'].astype(float).clip(lower=0)),
            'log_turbidez': np.log1p(datos['turbidez'].astype(float).clip(lower=0)),
            'temperatura': datos['temperatura'].astype(float),
        },
        index=datos.index,
    )


def incumplimientos_nb512(lectura):
    """Parámetros medidos por el nodo que están fuera de la NB 512-04."""
    fuera = []
    for parametro, (minimo, maximo) in UMBRALES_NB512.items():
        valor = lectura.get(parametro)
        if valor is not None and not pd.isna(valor) and not (minimo <= float(valor) <= maximo):
            fuera.append(parametro)
    return fuera


def clasificar(lectura, probabilidades):
    """probabilidades: lista en el orden de CLASES. Resultado final: "no apta"
    si lo que mide el nodo incumple la NB 512-04 (la norma prevalece); si la
    cumple, la clase que estima el modelo para los parámetros de laboratorio."""
    probabilidades = [float(p) for p in probabilidades]
    clase_modelo = CLASES[int(np.argmax(probabilidades))]
    fuera = incumplimientos_nb512(lectura)
    return {
        'clase': 'no_apta' if fuera else clase_modelo,
        'clase_modelo': clase_modelo,
        'probabilidades': {c: round(p, 4) for c, p in zip(CLASES, probabilidades)},
        'probabilidad_apta': round(probabilidades[0], 4),
        'cumple_nb512': not fuera,
        'parametros_fuera_nb512': fuera,
    }
