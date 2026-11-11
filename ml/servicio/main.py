"""Microservicio de aprendizaje automático de Yakuzone (FastAPI).

Despliega los tres modelos entrenados en ml/entrenamiento/ y los pone a
disposición del backend Node.js mediante una API REST:
  - POST /analizar:    clasificación (apta / en riesgo / no apta) y detección
                       de anomalías de las lecturas nuevas de un sensor;
  - POST /pronosticar: pronóstico de pH, turbidez y conductividad a 3 horas;
  - POST /clasificar:  clasificación de una lectura suelta;
  - GET  /metricas y /figuras: desempeño de cada modelo, para la plataforma.

Lee el historial de lecturas directamente de MySQL (solo consulta). Escucha
solo en el equipo local: el único que lo consume es el backend.

Uso (desde la carpeta ml/):
    .venv/Scripts/python -m uvicorn servicio.main:app --host 127.0.0.1 --port 8000
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from nucleo import bd
from nucleo.anomalias import calcular_caracteristicas, columnas_caracteristicas, diagnosticar, es_anomala, puntaje_a_escala
from nucleo.anomalias import VENTANA_LARGA
from nucleo.clasificacion import UMBRALES_NB512, VARIABLES, clasificar, preparar_entradas
from nucleo.pronostico import (
    DIAS_HISTORIA,
    PARAMETROS_PRONOSTICO,
    fechas_futuras,
    historia_reciente,
    preparar_serie,
    pronosticar,
    suficiente,
)

RAIZ = Path(__file__).resolve().parent.parent
MODELOS = RAIZ / 'modelos'
REPORTES = RAIZ / 'reportes'
FIGURAS = REPORTES / 'figuras'
PARAMETROS = bd.PARAMETROS

# Si la última lectura del sensor es más vieja que esto, no se pronostica:
# el resultado partiría de datos que ya no representan el agua.
MAX_ANTIGUEDAD_PRONOSTICO = pd.Timedelta(hours=1)

app = FastAPI(title='Yakuzone - servicio de aprendizaje automático', version='1.0.0')


def _cargar(nombre):
    ruta = MODELOS / f'{nombre}.joblib'
    return joblib.load(ruta) if ruta.exists() else None


modelos = {
    'clasificacion': _cargar('clasificador'),
    'anomalias': _cargar('anomalias'),
    'pronostico': _cargar('pronostico'),
}


def _requiere(nombre):
    if modelos[nombre] is None:
        raise HTTPException(503, f'El modelo de {nombre} todavía no está entrenado (ver ml/README.md)')


def _numero(valor):
    return None if valor is None or pd.isna(valor) else float(valor)


@app.get('/salud')
def salud():
    return {
        'estado': 'ok',
        'modelos': {nombre: modelo is not None for nombre, modelo in modelos.items()},
        'algoritmo_clasificacion': modelos['clasificacion']['algoritmo'] if modelos['clasificacion'] else None,
    }


class Lectura(BaseModel):
    ph: float
    conductividad: float
    turbidez: float
    temperatura: float


def _clasificar_filas(filas):
    datos = pd.DataFrame(filas)[VARIABLES].astype(float)
    probabilidades = modelos['clasificacion']['modelo'].predict_proba(preparar_entradas(datos))
    return [clasificar(fila, p) for fila, p in zip(datos.to_dict('records'), probabilidades)]


@app.post('/clasificar')
def clasificar_lectura(lectura: Lectura):
    _requiere('clasificacion')
    return _clasificar_filas([lectura.model_dump()])[0]


class PedidoAnalisis(BaseModel):
    sensor_id: int
    desde_id: int = Field(0, description='Se analizan las lecturas con id mayor a este')
    limite: int = Field(2000, ge=1, le=5000)


@app.post('/analizar')
def analizar(pedido: PedidoAnalisis):
    """Clasifica y evalúa con el detector de anomalías cada lectura nueva del
    sensor (id > desde_id). Para las variables de anomalías se usan también
    las lecturas de las horas anteriores como contexto."""
    nuevas = bd.lecturas(sensor_id=pedido.sensor_id, desde_id=pedido.desde_id, limite=pedido.limite)
    if nuevas.empty:
        return {'sensor_id': pedido.sensor_id, 'ultimo_id': pedido.desde_id, 'resultados': []}

    ultimo_id = int(nuevas['id'].max())
    resultados = {int(i): {'lectura_id': int(i), 'fecha_hora': f.isoformat()} for i, f in zip(nuevas['id'], nuevas['fecha_hora'])}

    if modelos['clasificacion'] is not None:
        clasificables = nuevas.dropna(subset=VARIABLES)
        for i, resultado in zip(clasificables['id'], _clasificar_filas(clasificables[VARIABLES].to_dict('records'))):
            resultados[int(i)]['clasificacion'] = resultado

    if modelos['anomalias'] is not None:
        contexto = pd.Timedelta(VENTANA_LARGA) + pd.Timedelta(hours=1)
        historia = bd.lecturas(sensor_id=pedido.sensor_id, desde=nuevas['fecha_hora'].min() - contexto)
        historia = historia[historia['id'] <= ultimo_id].reset_index(drop=True)
        variables = calcular_caracteristicas(historia.set_index('fecha_hora')[PARAMETROS]).reset_index(drop=True)
        evaluar = historia['id'] > pedido.desde_id
        completas = variables.notna().all(axis=1)
        modelo = modelos['anomalias']

        filas = evaluar & completas
        if filas.any():
            puntajes = modelo['modelo'].decision_function(variables.loc[filas, columnas_caracteristicas()])
            escala = puntaje_a_escala(puntajes, modelo['umbral'])
            for indice, puntaje, valor in zip(historia.index[filas], puntajes, escala):
                anomala = bool(es_anomala(puntaje, modelo['umbral'], variables.at[indice, 'minutos_congelado']))
                tipo, involucrados = diagnosticar(variables.loc[indice].to_dict()) if anomala else (None, [])
                resultados[int(historia.at[indice, 'id'])]['anomalia'] = {
                    'puntaje': round(float(valor), 4),
                    'es_anomalia': anomala,
                    'tipo': tipo,
                    'parametros': involucrados,
                }
        for indice in historia.index[evaluar & ~completas]:
            resultados[int(historia.at[indice, 'id'])]['anomalia'] = {
                'puntaje': None,
                'es_anomalia': False,
                'tipo': None,
                'parametros': [],
                'motivo': 'historia insuficiente',
            }

    return {'sensor_id': pedido.sensor_id, 'ultimo_id': ultimo_id, 'resultados': list(resultados.values())}


class PedidoPronostico(BaseModel):
    sensor_id: int


@app.post('/pronosticar')
def pronosticar_sensor(pedido: PedidoPronostico):
    """Pronóstico a 3 horas de pH, turbidez y conductividad con el método
    elegido en el entrenamiento para cada parámetro, ajustado con los últimos
    7 días del sensor. Señala el primer valor que saldría de la NB 512-04."""
    _requiere('pronostico')
    configuracion = modelos['pronostico']['parametros']
    datos = bd.lecturas(sensor_id=pedido.sensor_id, desde=pd.Timestamp.now() - pd.Timedelta(days=DIAS_HISTORIA))
    respuesta = {'sensor_id': pedido.sensor_id, 'generado_en': pd.Timestamp.now().isoformat(timespec='seconds'), 'pronosticos': {}, 'sin_pronostico': {}}

    if datos.empty:
        respuesta['sin_pronostico'] = {p: 'sin lecturas en los últimos 7 días' for p in PARAMETROS_PRONOSTICO}
        return respuesta
    serie = datos.set_index('fecha_hora')[PARAMETROS]
    if pd.Timestamp.now() - serie.index.max() > MAX_ANTIGUEDAD_PRONOSTICO:
        respuesta['sin_pronostico'] = {p: 'el sensor no envía lecturas desde hace más de 1 hora' for p in PARAMETROS_PRONOSTICO}
        return respuesta

    for parametro in PARAMETROS_PRONOSTICO:
        y = historia_reciente(preparar_serie(serie, parametro))
        if not suficiente(y):
            respuesta['sin_pronostico'][parametro] = 'historia insuficiente (se necesitan al menos 2 días de lecturas)'
            continue
        config = configuracion[parametro]
        try:
            valores = pronosticar(y, parametro, config['metodo'], config['orden_arima'])
        except Exception as error:  # noqa: BLE001 - un ajuste fallido no debe tumbar el servicio
            respuesta['sin_pronostico'][parametro] = f'no se pudo ajustar el modelo ({error})'
            continue
        fechas = fechas_futuras(y, len(valores))
        minimo, maximo = UMBRALES_NB512[parametro]
        fuera = next(
            ({'fecha_hora': f.isoformat(), 'valor': round(float(v), 3), 'limite': minimo if v < minimo else maximo}
             for f, v in zip(fechas, valores) if not (minimo <= v <= maximo)),
            None,
        )
        respuesta['pronosticos'][parametro] = {
            'metodo': config['metodo'],
            'ultimo_valor': _numero(y.dropna().iloc[-1]),
            'puntos': [{'fecha_hora': f.isoformat(), 'valor': round(float(v), 3)} for f, v in zip(fechas, valores)],
            'fuera_de_rango': fuera,
        }
    return respuesta


@app.get('/metricas')
def metricas():
    """Reportes de desempeño generados por los scripts de entrenamiento."""
    return {
        nombre: json.loads((REPORTES / f'{nombre}.json').read_text(encoding='utf-8')) if (REPORTES / f'{nombre}.json').exists() else None
        for nombre in ('clasificacion', 'anomalias', 'pronostico')
    }


def _figuras_disponibles():
    return sorted(p.stem for p in FIGURAS.glob('*.png')) if FIGURAS.exists() else []


@app.get('/figuras')
def figuras():
    return _figuras_disponibles()


@app.get('/figuras/{nombre}')
def figura(nombre: str):
    if nombre not in _figuras_disponibles():
        raise HTTPException(404, 'Figura no encontrada')
    return FileResponse(FIGURAS / f'{nombre}.png', media_type='image/png')


# Para que numpy no muestre advertencias por divisiones con ventanas vacías.
np.seterr(all='ignore')
