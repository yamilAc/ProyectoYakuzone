# Yakuzone — Backend

API REST (Express) + broker MQTT embebido (Aedes) + MySQL, para el monitoreo
en tiempo real de calidad del agua (proyecto de grado Yakuzone).

## Arquitectura

```
Sensores / simulador  --MQTT-->  Broker Aedes (embebido)  --suscriptor-->  MySQL
                                                                              |
Frontend React  <---- API REST (/api/...) con JWT ----  Express  <----------+
```

## Primer uso

1. Instalar dependencias:
   ```
   npm install
   ```
2. Crear la base de datos y las tablas (edita `.env` primero si tu MySQL
   tiene otro usuario/contraseña; por defecto usa `root` / `Univalle`, igual
   que el proyecto original):
   ```
   mysql -u root -p < schema.sql
   ```
   Esto crea la base `yakuDB`, todas las tablas (`usuarios`, `sensores`,
   `lecturas`, `equipos_mitigacion`, `miembros_equipo`, `alertas`,
   `sugerencias_mitigacion` y `fotos_mitigacion`), un sensor de ejemplo
   (`SN-001`) y un usuario administrador:
   - correo: `admin@yakuzone.com`
   - contraseña: `Admin123!`
   (cámbiala luego desde la pantalla de Usuarios).

   Si ya tenías la base creada con una versión anterior, en vez de
   `schema.sql` (que borra todo) corre una sola vez la migración no
   destructiva del rediseño de Notificaciones:
   ```
   mysql -u root -p yakuDB < migration_notificaciones.sql
   mysql -u root -p yakuDB < migration_fotos_mitigacion.sql
   ```

   Las fotos de evidencia que suben los jefes de equipo se guardan en
   `uploads/mitigaciones/` (la carpeta se crea sola y no se sube a git).

3. Levantar el servidor (API + broker MQTT, todo en un solo proceso):
   ```
   npm start
   ```
   Deberías ver en la consola algo como:
   ```
   [HTTP] Servidor Yakuzone escuchando en el puerto 3001
   [MQTT] Broker escuchando en el puerto 1883
   [MQTT] Backend conectado al broker como suscriptor
   ```

4. (Opcional) Agrega más sensores de ejemplo, para simular varias
   viviendas monitoreadas a la vez en vez de solo una:
   ```
   mysql -u root -p yakuDB < seed_sensores_adicionales.sql
   ```
   Esto agrega SN-002, SN-003 y SN-004 (no borra nada existente).

5. En otra terminal, corre el simulador (hace de sensor ESP32 mientras no
   se tenga el firmware/hardware real conectado). Por defecto simula los 4
   nodos (SN-001 a SN-004) al mismo tiempo, cada uno con su propia
   caminata aleatoria de valores:
   ```
   npm run simulate
   ```
   También puedes simular uno solo o una lista específica:
   ```
   node simulator.js SN-001
   node simulator.js SN-001,SN-002
   ```
   Vas a ver lecturas publicándose cada 5 segundos por sensor, y
   ocasionalmente una fuera de rango para probar las alertas.

6. Levanta el frontend (`yakuzone/`) normalmente con `npm start` e inicia
   sesión con el usuario administrador de arriba.

## Variables de entorno (`.env`)

Ver `.env.example`. `JWT_SECRET` ya viene generado con un valor aleatorio.

## Rutas de la API (todas bajo `/api`)

- `POST /api/login`
- `GET/POST/PUT/DELETE /api/usuarios` (solo administrador)
- `GET /api/sensores` — incluye los datos del propietario de cada vivienda
- `POST/PUT/DELETE /api/sensores` (solo administrador)
- `GET /api/lecturas?sensor_id=N&limite=100` — últimas lecturas (de todos los
  sensores o de uno)
- `GET /api/lecturas/ultimas` — última lectura de cada sensor (para colorear el mapa)
- `GET /api/lecturas/:sensorId?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD`
- `POST /api/lecturas` — inserción manual (pruebas sin MQTT)
- `GET /api/alertas?estado=pendiente|asignada|mitigada&sensor_id=N` — el
  jefe de un equipo de mitigación solo recibe las alertas de su equipo
- `GET /api/alertas/resumen` — cantidad de alertas por estado
- `GET /api/alertas/:id` — detalle: sensor, propietario, sugerencia de la IA,
  equipo asignado e historial de alertas pendientes y mitigadas del sensor
- `PUT /api/alertas/:id/asignar` — asigna la alerta a un equipo y avisa por
  correo a su jefe (administrador y empleado)
- `GET /api/alertas/historial?sensor_id&estado&parametro&desde&hasta&pagina&por_pagina`
  — historial completo paginado (solo administrador)
- `PUT /api/alertas/:id/mitigada` (multipart) — el jefe del equipo asignado
  registra qué se hizo (`observacion`) y sube las 3 fotos obligatorias
  (`equipo`, `casa`, `trabajo`; JPG, PNG o WebP de hasta 5 MB)
- `GET /api/alertas/:id/fotos/:tipo` — descarga una foto de evidencia
- `GET /api/reportes/alertas?sensor_id=N&desde&hasta&formato=pdf|xlsx` y
  `GET /api/reportes/general?desde&hasta&formato=pdf|xlsx` (solo administrador)
- `GET /api/equipos` (administrador y empleado),
  `POST/PUT/DELETE /api/equipos` (solo administrador)

## Umbrales de alerta

Definidos en `utils/thresholds.js` según la Norma Boliviana NB 512-04
(3ra revisión): pH 6,5 – 9,0; turbiedad hasta 5 UNT y conductividad hasta
1500 µS/cm (Tabla 6). La temperatura no tiene valor normado y no genera alertas.
