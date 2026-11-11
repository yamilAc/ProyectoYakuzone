# Yakuzone - firmware del nodo ESP32

Firmware del nodo de monitoreo (placa DOIT ESP32 DevKit V1, módulo
ESP32-WROOM-32), programado con Arduino IDE 2.3.10. Cada 5 segundos lee los
sensores y publica la lectura por MQTT en el broker del backend:

- Tópico: `yakuzone/sensores/<número de serie>/lecturas`
- Mensaje: `{"temperatura": 21.44, "ph": 7.10, "turbidez": 0.80, "conductividad": 450.00}`

Un parámetro sin dato válido no se envía y el backend lo guarda vacío. La
fecha y hora la asigna el servidor al recibir el mensaje.

## Sensores y pines

| Sensor | Parámetro | Pin del ESP32 | Estado |
|---|---|---|---|
| DS18B20 sumergible (1-Wire) | temperatura | GPIO 4 (D4) | conectado |
| PH-4502C | ph | GPIO 34 | reservado |
| Turbidez | turbidez | GPIO 35 | reservado |
| DFR0300 | conductividad | GPIO 32 | reservado |

Los sensores analógicos van en pines del ADC1 (GPIO 32 a 39), porque los del
ADC2 no se pueden leer mientras el Wi-Fi está encendido.

## Conexión del DS18B20 (sonda de 3 hilos)

| Cable de la sonda | Pin del ESP32 |
|---|---|
| Rojo (VDD) | 3V3 |
| Negro (GND) | GND |
| Amarillo (datos) | D4 (GPIO 4) |

Además, una resistencia de 4,7 kΩ entre el cable de datos y 3V3 (resistencia
de pull-up que necesita el bus 1-Wire). Se alimenta con 3,3 V y no con 5 V
(VIN), porque los pines del ESP32 trabajan a 3,3 V. Si los colores de la
sonda son otros, revisar los datos del vendedor.

En la placa de 30 pines, 3V3, GND y D4 están del mismo lado; conviene dejar
libre ese lado en la protoboard.

## Preparación (una sola vez)

1. Arduino IDE 2.3.10 con el paquete de placas **esp32** de Espressif.
2. Librerías (Library Manager): **OneWire**, **DallasTemperature**,
   **ArduinoJson** (7.x) y **PubSubClient** (de Nick O'Leary).
3. Registrar el nodo en la página **Sensores** de la plataforma con su número
   de serie (por ejemplo `SN-010`).
4. Copiar `yakuzone_nodo/credenciales_ejemplo.h` como
   `yakuzone_nodo/credenciales.h` y completar la red Wi-Fi, la IP de la PC
   donde corre el backend y el número de serie. Este archivo no se sube a git.

La PC del backend debe aceptar conexiones al puerto 1883 desde la red local:
en Windows, la red Wi-Fi tiene que estar como **red privada** (Configuración →
Red e Internet → Wi-Fi → la red → Red privada), que es donde el firewall
permite a Node.js recibir conexiones.

## Cargar el programa

1. Abrir `yakuzone_nodo/yakuzone_nodo.ino` en Arduino IDE.
2. Conectar la placa por USB y elegir la placa **DOIT ESP32 DEVKIT V1** y su
   puerto COM.
3. Subir el programa (flecha →). Si se queda en "Connecting...", mantener
   apretado el botón **BOOT** de la placa hasta que empiece a cargar.
4. Abrir el **Monitor Serie** a **115200 baudios**.

## Mensajes del Monitor Serie

| Mensaje | Significado |
|---|---|
| `[DS18B20] Sondas encontradas: 1` | La sonda responde |
| `[DS18B20] No se encontró la sonda` | Revisar el cable de datos y la resistencia de 4,7 kΩ |
| `[WiFi] Conectado. IP del nodo: ...` | Conectado a la red |
| `[WiFi] No se encuentra la red` | Nombre mal escrito o red de 5 GHz (el ESP32 solo usa 2,4 GHz) |
| `[MQTT] Conectado` | Conectado al broker del backend |
| `[MQTT] No se pudo conectar` | Backend apagado, IP equivocada o el firewall bloquea el puerto 1883 |
| `[Lectura] {...} -> enviada` | Lectura publicada (el LED azul parpadea) |

El nodo lee los sensores aunque no tenga conexión, así que la sonda se puede
probar desde el Monitor Serie antes de configurar la red.
