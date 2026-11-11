# Yakuzone - servicio de aprendizaje automático

Tres modelos propios, entrenados con Python y desplegados en un microservicio
FastAPI que consume el backend Node.js (sección 7.21 del perfil):

| Modelo | Algoritmos | Datos | Salida |
|---|---|---|---|
| Clasificación de la calidad del agua | Regresión logística (base), Random Forest y XGBoost | Water Quality Portal: muestras de laboratorio de 22 estaciones del USGS (2000-2024) | apta / en riesgo / no apta y su probabilidad |
| Detección de anomalías | Isolation Forest con variables derivadas | USGS 01646500 (lecturas reales cada 5 min) | puntaje de anomalía y causa probable |
| Pronóstico de series temporales | Persistencia (base), ARIMA y Prophet | USGS 01646500 (promedios de 15 min) | pH, turbidez y conductividad a 3 horas |

Mientras el nodo IoT no acumule varios días de lecturas propias, los modelos
se entrenan con datos públicos reales del Servicio Geológico de EE. UU.
(USGS); cuando haya suficientes lecturas del prototipo, se pueden reentrenar
con ellas.

### Etiqueta de la clasificación

Cada muestra del Water Quality Portal tiene, además de lo que mide el nodo
(pH, conductividad, turbidez y temperatura), parámetros que solo se obtienen
en laboratorio. La etiqueta es un índice de cumplimiento de la NB 512-04 en
esos parámetros: la mayor razón valor / límite entre nitrato (10 mg/L como N),
sulfato (400 mg/L), cloruro (250 mg/L), dureza (500 mg/L) y sólidos disueltos
totales (1000 mg/L). Con índice menor a 0,75 la muestra es **apta**, entre
0,75 y 1 **en riesgo** y mayor a 1 **no apta**. El modelo aprende a estimar
esa clase con las mediciones del sensor. En el sistema, si una lectura
incumple la NB 512-04 en lo que mide el sensor, la clase final es no apta sin
importar lo que diga el modelo.

El conjunto de Kaggle "Water Potability" (Kadiwal, 2021) se evaluó y se
descartó: con las variables del nodo sus etiquetas no se pueden predecir (AUC
0,49) y contradicen la normativa (ver `conjunto_descartado` en
`reportes/clasificacion.json`).

## Estructura

```
ml/
  entrenamiento/   scripts de entrenamiento y evaluación (generan modelos y reportes)
  nucleo/          lógica compartida por el entrenamiento y el microservicio
  servicio/        microservicio FastAPI
  modelos/         modelos entrenados (.joblib)
  reportes/        métricas (.json) y figuras (.png) para el documento
  datos/           datasets descargados (no se suben a git)
```

## Instalación (Python 3.11)

```
cd ml
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-lock.txt
```

`requirements-lock.txt` fija la versión exacta de todas las dependencias;
`requirements.txt` lista solo las librerías que usa el proyecto directamente.

## Datos

- **Water Quality Portal (clasificación):** `.venv\Scripts\python -m entrenamiento.descargar_wqp`
  (genera `ml/datos/wqp_muestras.csv` y `ml/datos/wqp_estaciones.csv`).
- **USGS (anomalías y pronóstico):** `.venv\Scripts\python -m entrenamiento.descargar_usgs`
  (genera `ml/datos/usgs_01646500.csv`, mayo a octubre de 2026).
- **Kaggle (opcional, solo para el diagnóstico del conjunto descartado):**
  `water_potability.csv` de
  https://www.kaggle.com/datasets/adityakadiwal/water-potability en `ml/datos/`.
  Si no está, el reporte de clasificación omite esa sección.

## Entrenamiento

```
.venv\Scripts\python -m entrenamiento.clasificacion
.venv\Scripts\python -m entrenamiento.anomalias
.venv\Scripts\python -m entrenamiento.pronostico
```

Cada script guarda el modelo en `modelos/`, sus métricas en `reportes/*.json`
y las figuras en `reportes/figuras/`. Los resultados son reproducibles
(semilla fija).

## Microservicio

```
.venv\Scripts\python -m uvicorn servicio.main:app --host 127.0.0.1 --port 8000
```

Lee las lecturas de MySQL con la configuración de `ml/.env` o, si no existe,
la de `node/.env`. Documentación interactiva de la API: http://127.0.0.1:8000/docs

| Ruta | Uso |
|---|---|
| `GET /salud` | Estado del servicio y modelos cargados |
| `POST /analizar` | Clasificación y anomalías de las lecturas nuevas de un sensor (`sensor_id`, `desde_id`) |
| `POST /pronosticar` | Pronóstico a 3 horas de un sensor (`sensor_id`) |
| `POST /clasificar` | Clasificación de una lectura (`ph`, `conductividad`, `turbidez`, `temperatura`) |
| `GET /metricas` | Métricas de desempeño de los tres modelos |
| `GET /figuras`, `GET /figuras/{nombre}` | Figuras generadas en el entrenamiento |
