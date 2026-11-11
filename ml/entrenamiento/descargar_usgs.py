"""Descarga series reales de calidad del agua del Servicio Geológico de los
Estados Unidos (USGS, datos de dominio público) para entrenar y evaluar los
modelos de detección de anomalías y de pronóstico, mientras el nodo IoT del
proyecto no haya acumulado varios días de lecturas propias.

Estación por defecto: USGS 01646500, Potomac River near Washington DC, Little
Falls Pump (toma de agua cruda de una planta potabilizadora), que mide cada 5
minutos los mismos cuatro parámetros que el nodo: temperatura (00010),
conductividad específica (00095), pH (00400) y turbidez (63680).

Uso (desde la carpeta ml/):
    .venv/Scripts/python entrenamiento/descargar_usgs.py
    .venv/Scripts/python entrenamiento/descargar_usgs.py --sitio 06892350 --desde 2026-05-01 --hasta 2026-10-31

Genera datos/usgs_<sitio>.csv con las columnas
fecha_hora, temperatura, conductividad, ph, turbidez.
"""

import argparse
import csv
import io
import sys
import urllib.request
from pathlib import Path

# Código USGS de cada parámetro -> nombre de columna usado en el proyecto
PARAMETROS = {
    '00010': 'temperatura',  # °C
    '00095': 'conductividad',  # µS/cm a 25 °C
    '00400': 'ph',
    '63680': 'turbidez',  # FNU (equivalente práctico a NTU)
}

URL = 'https://waterservices.usgs.gov/nwis/iv/'
CARPETA_DATOS = Path(__file__).resolve().parent.parent / 'datos'


def descargar(sitio, desde, hasta):
    consulta = (
        f'{URL}?format=rdb&sites={sitio}&parameterCd={",".join(PARAMETROS)}'
        f'&startDT={desde}&endDT={hasta}&siteStatus=all'
    )
    print(f'Descargando {consulta}')
    with urllib.request.urlopen(consulta, timeout=300) as respuesta:
        return respuesta.read().decode('utf-8')


def convertir(rdb):
    """Pasa el formato RDB (tabulado) de USGS a filas con una columna por
    parámetro. Si una estación tiene varias series del mismo parámetro, se usa
    la primera. Los valores no numéricos (p. ej. 'Eqp', equipo fuera de
    servicio) quedan vacíos."""
    lineas = [l for l in rdb.splitlines() if l and not l.startswith('#')]
    lector = csv.reader(io.StringIO('\n'.join(lineas)), delimiter='\t')
    encabezado = next(lector)
    next(lector)  # fila de formatos (5s, 15s, ...)

    columnas = {}
    for i, nombre in enumerate(encabezado):
        for codigo, destino in PARAMETROS.items():
            if nombre.endswith(f'_{codigo}') and destino not in columnas:
                columnas[destino] = i
    faltan = [p for p in PARAMETROS.values() if p not in columnas]
    if faltan:
        sys.exit(f'La estación no tiene datos de: {", ".join(faltan)}')

    i_fecha = encabezado.index('datetime')
    filas = []
    for fila in lector:
        registro = {'fecha_hora': fila[i_fecha]}
        for destino, i in columnas.items():
            try:
                registro[destino] = float(fila[i])
            except (ValueError, IndexError):
                registro[destino] = ''
        filas.append(registro)
    return filas


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sitio', default='01646500')
    parser.add_argument('--desde', default='2026-05-01')
    parser.add_argument('--hasta', default='2026-10-31')
    args = parser.parse_args()

    filas = convertir(descargar(args.sitio, args.desde, args.hasta))
    CARPETA_DATOS.mkdir(exist_ok=True)
    destino = CARPETA_DATOS / f'usgs_{args.sitio}.csv'
    with open(destino, 'w', newline='', encoding='utf-8') as f:
        escritor = csv.DictWriter(f, fieldnames=['fecha_hora', *PARAMETROS.values()])
        escritor.writeheader()
        escritor.writerows(filas)
    print(f'{len(filas)} registros guardados en {destino}')


if __name__ == '__main__':
    main()
