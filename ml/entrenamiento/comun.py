"""Piezas comunes del entrenamiento de los modelos de Yakuzone: rutas de
carpetas, umbrales de la NB 512-04, carga de datos (USGS, Kaggle y la base
MySQL del sistema) y guardado de métricas y figuras para el documento."""

import json
import os
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use('Agg')  # sin ventana: las figuras se guardan como PNG
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / 'datos'
MODELOS = RAIZ / 'modelos'
REPORTES = RAIZ / 'reportes'
FIGURAS = REPORTES / 'figuras'

PARAMETROS = ['temperatura', 'conductividad', 'ph', 'turbidez']
ETIQUETAS = {
    'temperatura': 'Temperatura (°C)',
    'conductividad': 'Conductividad (µS/cm)',
    'ph': 'pH',
    'turbidez': 'Turbidez (NTU)',
}

# Valores aceptables de la Norma Boliviana NB 512-04 (los mismos que usa el
# backend en node/utils/thresholds.js). La temperatura no tiene límite normado.
UMBRALES = {
    'ph': (6.5, 9.0),
    'turbidez': (0.0, 5.0),
    'conductividad': (0.0, 1500.0),
}

SEMILLA = 42  # para que los resultados se puedan reproducir


def fuera_de_norma(fila):
    """True si la lectura incumple algún umbral de la NB 512-04."""
    return any(
        pd.notna(fila[p]) and not (minimo <= fila[p] <= maximo) for p, (minimo, maximo) in UMBRALES.items()
    )


def cargar_usgs(sitio='01646500'):
    """Serie de USGS descargada con descargar_usgs.py, indexada por fecha."""
    ruta = DATOS / f'usgs_{sitio}.csv'
    if not ruta.exists():
        raise SystemExit(f'Falta {ruta}: ejecuta primero entrenamiento/descargar_usgs.py')
    serie = pd.read_csv(ruta, parse_dates=['fecha_hora']).set_index('fecha_hora').sort_index()
    return serie[PARAMETROS]


def cargar_lecturas_bd(sensor_id=None):
    """Lecturas registradas por los sensores del sistema (tabla `lecturas`)."""
    from nucleo.bd import lecturas

    return lecturas(sensor_id=sensor_id)


def guardar_reporte(nombre, contenido):
    """Guarda las métricas de un modelo en reportes/<nombre>.json (las lee el
    microservicio para mostrarlas en la plataforma)."""
    REPORTES.mkdir(parents=True, exist_ok=True)
    contenido = {'generado_en': datetime.now().isoformat(timespec='seconds'), **contenido}
    ruta = REPORTES / f'{nombre}.json'
    ruta.write_text(json.dumps(contenido, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Reporte: {ruta}')
    return ruta


def guardar_figura(figura, nombre):
    FIGURAS.mkdir(parents=True, exist_ok=True)
    ruta = FIGURAS / f'{nombre}.png'
    figura.savefig(ruta, dpi=150, bbox_inches='tight')
    plt.close(figura)
    print(f'Figura: {ruta}')
    return ruta


def preparar_carpetas():
    for carpeta in (DATOS, MODELOS, REPORTES, FIGURAS):
        carpeta.mkdir(parents=True, exist_ok=True)


os.environ.setdefault('PYTHONHASHSEED', str(SEMILLA))
