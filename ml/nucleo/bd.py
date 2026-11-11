"""Lectura (solo consulta) de las lecturas de los sensores desde la base MySQL
del sistema. La usan el entrenamiento y el microservicio."""

from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
PARAMETROS = ['temperatura', 'conductividad', 'ph', 'turbidez']

COLUMNAS = (
    'id, sensor_id, fecha_hora, valor_temperatura AS temperatura, valor_conductividad AS conductividad, '
    'valor_ph AS ph, valor_turbidez AS turbidez'
)


def configuracion_bd():
    """Datos de conexión: los de ml/.env, o si no existe, los del backend
    (node/.env), para no repetir la configuración."""
    from dotenv import dotenv_values

    for ruta in (RAIZ / '.env', RAIZ.parent / 'node' / '.env'):
        if ruta.exists():
            valores = dotenv_values(ruta)
            return {
                'host': valores.get('DB_HOST') or 'localhost',
                'user': valores.get('DB_USER') or 'root',
                'password': valores.get('DB_PASSWORD') or '',
                'database': valores.get('DB_NAME') or 'yakuDB',
            }
    return {'host': 'localhost', 'user': 'root', 'password': '', 'database': 'yakuDB'}


def consultar(sql, params=()):
    import pymysql

    conexion = pymysql.connect(**configuracion_bd())
    try:
        with conexion.cursor() as cursor:
            cursor.execute(sql, params)
            columnas = [c[0] for c in cursor.description]
            filas = cursor.fetchall()
    finally:
        conexion.close()
    datos = pd.DataFrame(list(filas), columns=columnas)
    for p in PARAMETROS:
        if p in datos:
            datos[p] = pd.to_numeric(datos[p], errors='coerce')
    if 'fecha_hora' in datos:
        datos['fecha_hora'] = pd.to_datetime(datos['fecha_hora'])
    return datos


def lecturas(sensor_id=None, desde=None, desde_id=None, limite=None):
    """Lecturas ordenadas por fecha. Filtros opcionales: sensor, fecha mínima
    y id mínimo (exclusivo)."""
    condiciones, params = [], []
    if sensor_id is not None:
        condiciones.append('sensor_id = %s')
        params.append(sensor_id)
    if desde is not None:
        condiciones.append('fecha_hora >= %s')
        params.append(desde)
    if desde_id is not None:
        condiciones.append('id > %s')
        params.append(desde_id)
    sql = f'SELECT {COLUMNAS} FROM lecturas'
    if condiciones:
        sql += ' WHERE ' + ' AND '.join(condiciones)
    sql += ' ORDER BY fecha_hora, id'
    if limite:
        sql += f' LIMIT {int(limite)}'
    return consultar(sql, tuple(params))
