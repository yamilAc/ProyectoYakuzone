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
   Esto crea la base `yakuDB`, las tablas `usuarios`, `sensores`, `lecturas`
   y `alertas`, un sensor de ejemplo (`SN-001`) y un usuario administrador:
   - correo: `admin@yakuzone.com`
   - contraseña: `Admin123!`
   (cámbiala luego desde la pantalla de Usuarios).

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
- `GET/POST /api/sensores`
- `GET /api/lecturas` — últimas lecturas
- `GET /api/lecturas/ultimas` — última lectura de cada sensor (para colorear el mapa)
- `GET /api/lecturas/:sensorId?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD`
- `POST /api/lecturas` — inserción manual (pruebas sin MQTT)
- `GET /api/alertas`
- `PUT /api/alertas/:id/leida`

## Umbrales de alerta

Definidos en `utils/thresholds.js` según la Norma Boliviana NB 512-04.
El valor de conductividad eléctrica es una estimación (ver comentario en el
archivo) — conviene confirmarlo con el tutor antes de la defensa.
