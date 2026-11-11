// Yakuzone - firmware del nodo de monitoreo (placa DOIT ESP32 DevKit V1)
//
// Cada 5 segundos lee los sensores y publica la lectura por MQTT en el tópico
// yakuzone/sensores/<N_SERIE>/lecturas, con el formato que espera el backend:
//   {"temperatura": 21.44, "ph": 7.10, "turbidez": 0.80, "conductividad": 450.00}
// Un parámetro sin dato válido no se envía (el backend lo guarda vacío). La
// fecha y hora la pone el servidor al recibir el mensaje.
//
// Sensores conectados por ahora: temperatura (DS18B20 sumergible).
// Pines reservados para los demás (entradas analógicas del ADC1, que siguen
// funcionando con el Wi-Fi encendido, a diferencia de las del ADC2):
//   pH (PH-4502C) -> GPIO 34, turbidez -> GPIO 35, conductividad (DFR0300) -> GPIO 32.
//
// Librerías: OneWire, DallasTemperature, ArduinoJson (7.x) y PubSubClient.
// Los datos de la red van en credenciales.h (ver credenciales_ejemplo.h).

#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include "credenciales.h"

const uint8_t PIN_DS18B20 = 4;  // línea de datos de la sonda (con resistencia de 4,7 kΩ a 3,3 V)
const uint8_t PIN_LED = 2;      // LED azul de la placa: parpadea con cada lectura enviada

const unsigned long INTERVALO_LECTURA_MS = 5000;
const unsigned long ESPERA_RECONEXION_MQTT_MS = 5000;
const unsigned long ESPERA_RECONEXION_WIFI_MS = 15000;

OneWire busOneWire(PIN_DS18B20);
DallasTemperature sondaTemperatura(&busOneWire);
WiFiClient clienteWifi;
PubSubClient mqtt(clienteWifi);

char topico[64];
char idCliente[48];
unsigned long ultimaLectura = 0;
unsigned long ultimoIntentoMqtt = 0;
unsigned long ultimoIntentoWifi = 0;

// ---------------------------------------------------------------- Wi-Fi --

void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_CLAVE);
  ultimoIntentoWifi = millis();
  Serial.printf("[WiFi] Conectando a la red \"%s\"...\n", WIFI_SSID);
}

// Avisa cuando la conexión cambia y, si no se logra conectar, explica la
// causa más probable y vuelve a intentar.
void vigilarWifi() {
  static bool estabaConectado = false;
  const wl_status_t estado = WiFi.status();
  const bool conectado = estado == WL_CONNECTED;

  if (conectado && !estabaConectado) {
    Serial.printf("[WiFi] Conectado. IP del nodo: %s | señal: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else if (!conectado && estabaConectado) {
    Serial.println("[WiFi] Se perdió la conexión; reintentando...");
  }
  estabaConectado = conectado;

  if (!conectado && millis() - ultimoIntentoWifi >= ESPERA_RECONEXION_WIFI_MS) {
    if (estado == WL_NO_SSID_AVAIL) {
      Serial.printf("[WiFi] No se encuentra la red \"%s\". El ESP32 solo se conecta a redes de 2,4 GHz (no 5 GHz).\n", WIFI_SSID);
    } else {
      Serial.printf("[WiFi] Sin conexión (estado %d). Revisa el nombre y la contraseña en credenciales.h.\n", estado);
    }
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_CLAVE);
    ultimoIntentoWifi = millis();
  }
}

// ----------------------------------------------------------------- MQTT --

void vigilarMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (ultimoIntentoMqtt != 0 && millis() - ultimoIntentoMqtt < ESPERA_RECONEXION_MQTT_MS) return;
  ultimoIntentoMqtt = millis();

  Serial.printf("[MQTT] Conectando al broker %s:%d...\n", MQTT_SERVIDOR, MQTT_PUERTO);
  if (mqtt.connect(idCliente)) {
    Serial.printf("[MQTT] Conectado. Publicando en %s\n", topico);
  } else {
    Serial.printf("[MQTT] No se pudo conectar (código %d). ¿Está corriendo el backend (npm start), la IP es la de la PC "
                  "y el firewall de Windows permite el puerto %d?\n",
                  mqtt.state(), MQTT_PUERTO);
  }
}

// -------------------------------------------------------------- Sensores --

// Temperatura del agua en °C, o NAN si la sonda no responde. La librería
// devuelve -127 °C cuando no encuentra la sonda y 85 °C es el valor que
// entrega el DS18B20 recién encendido, antes de su primera conversión.
float leerTemperatura() {
  sondaTemperatura.requestTemperatures();  // ~750 ms con resolución de 12 bits
  const float t = sondaTemperatura.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t == 85.0f) return NAN;
  return t;
}

// Agrega el parámetro al mensaje solo si tiene un valor válido, con 2 decimales.
void agregarParametro(JsonDocument& lectura, const char* nombre, float valor) {
  if (!isnan(valor)) lectura[nombre] = serialized(String(valor, 2));
}

void leerYPublicar() {
  JsonDocument lectura;
  agregarParametro(lectura, "temperatura", leerTemperatura());
  // Cuando se conecten los demás sensores:
  // agregarParametro(lectura, "ph", leerPh());
  // agregarParametro(lectura, "turbidez", leerTurbidez());
  // agregarParametro(lectura, "conductividad", leerConductividad());

  if (lectura.size() == 0) {
    Serial.println("[Lectura] Ningún sensor respondió: revisa las conexiones (no se envía nada).");
    return;
  }

  char mensaje[160];
  serializeJson(lectura, mensaje, sizeof(mensaje));

  if (!mqtt.connected()) {
    Serial.printf("[Lectura] %s (sin conexión al broker, no se envió)\n", mensaje);
    return;
  }
  if (mqtt.publish(topico, mensaje)) {
    Serial.printf("[Lectura] %s -> enviada\n", mensaje);
    digitalWrite(PIN_LED, HIGH);
    delay(80);
    digitalWrite(PIN_LED, LOW);
  } else {
    Serial.printf("[Lectura] %s -> error al publicar\n", mensaje);
  }
}

// ----------------------------------------------------------------- Inicio --

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  snprintf(topico, sizeof(topico), "yakuzone/sensores/%s/lecturas", N_SERIE);
  snprintf(idCliente, sizeof(idCliente), "yakuzone-%s", N_SERIE);
  Serial.printf("\n=== Yakuzone - nodo %s ===\n", N_SERIE);

  sondaTemperatura.begin();
  sondaTemperatura.setResolution(12);
  const int sondas = sondaTemperatura.getDeviceCount();
  if (sondas == 0) {
    Serial.printf("[DS18B20] No se encontró la sonda en el GPIO %d. Revisa el cable de datos y la resistencia de 4,7 kΩ.\n", PIN_DS18B20);
  } else {
    Serial.printf("[DS18B20] Sondas encontradas: %d\n", sondas);
  }

  mqtt.setServer(MQTT_SERVIDOR, MQTT_PUERTO);
  mqtt.setSocketTimeout(5);
  conectarWifi();
}

void loop() {
  vigilarWifi();
  vigilarMqtt();
  mqtt.loop();

  // Se lee aunque no haya conexión, para poder probar el sensor desde el
  // Monitor Serie antes de configurar la red.
  if (ultimaLectura == 0 || millis() - ultimaLectura >= INTERVALO_LECTURA_MS) {
    ultimaLectura = millis();
    leerYPublicar();
  }
}
