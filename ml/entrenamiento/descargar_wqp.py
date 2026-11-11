"""Descarga muestras de laboratorio reales del Water Quality Portal (USGS y EPA,
datos de dominio público) para construir el conjunto de datos del modelo de
clasificación: cada muestra tiene los 4 parámetros que mide el nodo IoT y
otros parámetros de laboratorio con los que se calcula un índice de calidad
del agua (ver entrenamiento/indice_calidad.py).

Se usan estaciones de ríos con aguas distintas (agrícolas con nitrato alto,
de zonas áridas con sulfatos y sales altos, y grandes ríos), para que los
parámetros de laboratorio realmente cambien la calidad del agua y el modelo
tenga que inferirlos a partir de lo que mide el nodo.

Uso (desde la carpeta ml/):
    .venv/Scripts/python entrenamiento/descargar_wqp.py
Genera datos/wqp_muestras.csv con los resultados tal como los entrega el portal.
"""

import argparse
import urllib.parse
import urllib.request
from pathlib import Path

URL = 'https://www.waterqualitydata.us/data/Result/search'
CARPETA_DATOS = Path(__file__).resolve().parent.parent / 'datos'

# Estaciones del USGS con muestras de laboratorio desde el año 2000: grandes
# ríos, ríos agrícolas (nitrato alto) y ríos de zonas áridas (sulfatos, sales y
# dureza altos). Los nombres oficiales se guardan en datos/wqp_estaciones.csv.
ESTACIONES = [
    'USGS-01646580', 'USGS-01578310', 'USGS-02035000', 'USGS-03612600',
    'USGS-05420500', 'USGS-05465500', 'USGS-05586100', 'USGS-05054000',
    'USGS-05082500', 'USGS-05330000', 'USGS-06485500', 'USGS-06805500',
    'USGS-06892350', 'USGS-06934500', 'USGS-07144100', 'USGS-07227500',
    'USGS-07311700', 'USGS-07331600', 'USGS-07374000', 'USGS-08079600',
    'USGS-08116650', 'USGS-08330000', 'USGS-08364000', 'USGS-09095500',
    'USGS-09180500', 'USGS-09429490', 'USGS-11303500',
]

CARACTERISTICAS = [
    # Los que mide el nodo
    'pH',
    'Specific conductance',
    'Turbidity',
    'Temperature, water',
    # Parámetros de laboratorio para el índice de calidad
    'Nitrate',
    'Inorganic nitrogen (nitrate and nitrite)',
    'Sulfate',
    'Chloride',
    'Hardness, Ca, Mg',
    'Total dissolved solids',
]


def nombres_estaciones():
    """Nombre oficial y ubicación de cada estación (servicio Station del portal)."""
    parametros = [('siteid', e) for e in ESTACIONES] + [('mimeType', 'csv'), ('zip', 'no')]
    url = 'https://www.waterqualitydata.us/data/Station/search?' + urllib.parse.urlencode(parametros)
    with urllib.request.urlopen(url, timeout=300) as respuesta:
        return respuesta.read().decode('utf-8')


def descargar(estacion, desde):
    parametros = [('siteid', estacion), ('startDateLo', desde), ('mimeType', 'csv'), ('zip', 'no')]
    parametros += [('characteristicName', c) for c in CARACTERISTICAS]
    with urllib.request.urlopen(f'{URL}?{urllib.parse.urlencode(parametros)}', timeout=900) as respuesta:
        return respuesta.read().decode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--desde', default='01-01-2000', help='MM-DD-AAAA')
    args = parser.parse_args()

    CARPETA_DATOS.mkdir(exist_ok=True)
    destino = CARPETA_DATOS / 'wqp_muestras.csv'
    total = 0
    with open(destino, 'w', encoding='utf-8', newline='') as salida:
        for i, estacion in enumerate(ESTACIONES):
            texto = descargar(estacion, args.desde)
            lineas = texto.splitlines()
            if not lineas:
                continue
            # El encabezado se escribe una sola vez
            cuerpo = lineas if i == 0 else lineas[1:]
            salida.write('\n'.join(cuerpo) + '\n')
            total += len(lineas) - 1
            print(f'{estacion}: {len(lineas) - 1} resultados', flush=True)
    print(f'{total} resultados guardados en {destino}')
    (CARPETA_DATOS / 'wqp_estaciones.csv').write_text(nombres_estaciones(), encoding='utf-8')
    print('Nombres de las estaciones guardados en datos/wqp_estaciones.csv')


if __name__ == '__main__':
    main()
