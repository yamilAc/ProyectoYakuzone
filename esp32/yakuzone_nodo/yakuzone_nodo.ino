// Yakuzone - firmware del nodo de monitoreo (placa DOIT ESP32 DevKit V1)
//
// Cada 5 segundos lee los sensores y publica la lectura por MQTT en el tópico
// yakuzone/sensores/<N_SERIE>/lecturas, con el formato que espera el backend:
//   {"temperatura": 21.44, "ph": 7.10, "turbidez": 0.80, "conductividad": 450.00}
// Un parámetro sin dato válido no se envía (el backend lo guarda vacío). La
// fecha y hora la pone el servidor al recibir el mensaje.
//
// Sensores y pines (las entradas analógicas son del ADC1, que sigue
// funcionando con el Wi-Fi encendido, a diferencia de las del ADC2):
//   temperatura  DS18B20 sumergible          GPIO 4  (4,7 kΩ a 3,3 V)
//   pH           módulo PH-4502C, a 5 V      GPIO 34 (divisor de 2 x 10 kΩ)
//   turbidez     módulo de turbidez, a 5 V   GPIO 35 (divisor de 2 x 10 kΩ)
//   conductividad  DFRobot SEN0244 (TDS)     GPIO 32 (directo); su "+" va al
//                  GPIO 25, que lo enciende solo al medir (ver PIN_ALIMENTACION_TDS)
// Los módulos de pH y turbidez entregan hasta 5 V y el ESP32 admite como
// máximo 3,3 V en sus pines: el divisor deja la señal a la mitad.
//
// Librerías: OneWire, DallasTemperature, ArduinoJson (7.x) y PubSubClient.
// Los datos de la red van en credenciales.h (ver credenciales_ejemplo.h).

#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include "credenciales.h"

// ------------------------------------------------ Sensores conectados --
// 1 = conectado, 0 = todavía no. Se arma y se prueba de a un sensor: un pin
// analógico sin nada conectado da valores al azar, así que no se envía.
#define USAR_TEMPERATURA 1
#define USAR_CONDUCTIVIDAD 1
#define USAR_TURBIDEZ 1
#define USAR_PH 1

// ---------------------------------------------------------- Calibración --
// Se ajustan con los voltajes que muestra el Monitor Serie (ver README).
// pH: voltaje del módulo con pH 7 y cuántos voltios cambia por unidad de pH
// (el voltaje sube cuando el agua es más ácida).
const float PH_VOLTAJE_PH7 = 2.50;
const float PH_VOLTIOS_POR_UNIDAD = 0.18;
// Turbidez: voltaje del módulo con la sonda en agua limpia. En agua del grifo
// transparente el promedio fue de 3,544 a 3,55 V, con mínimos de 3,538 V
// (25/11/2026). Se usa 3,53 V como margen: cerca del agua limpia 1 mV
// equivale a ~3,5 NTU y, sin margen, el agua limpia llegaba a marcar 25-50
// NTU y generaba alertas falsas. Con este valor, 5 NTU corresponden a una
// caída de ~0,015 V respecto del agua limpia.
const float TURBIDEZ_VOLTAJE_AGUA_LIMPIA = 3.53;
// Conductividad: factor de corrección (1.0 = sin corregir).
const float CONDUCTIVIDAD_FACTOR = 1.0;

// ---------------------------------------------------------------- Pines --
const uint8_t PIN_DS18B20 = 4;
const uint8_t PIN_PH = 34;
const uint8_t PIN_TURBIDEZ = 35;
const uint8_t PIN_CONDUCTIVIDAD = 32;
// El sensor de TDS hace circular una pequeña corriente por el agua que desvía
// la lectura de pH cuando ambas sondas están en el mismo recipiente. Por eso
// su "+" se alimenta desde este pin (consume unos 5 mA) y se enciende solo
// mientras se mide la conductividad, después de leer el pH.
const uint8_t PIN_ALIMENTACION_TDS = 25;
const unsigned long ESPERA_ENCENDIDO_TDS_MS = 1000;
const uint8_t PIN_LED = 2;  // LED azul de la placa: parpadea con cada lectura enviada
const float DIVISOR = 2.0;  // dos resistencias iguales: la señal llega a la mitad

const unsigned long INTERVALO_LECTURA_MS = 5000;
const unsigned long ESPERA_RECONEXION_MQTT_MS = 5000;
const unsigned long ESPERA_RECONEXION_WIFI_MS = 15000;

// Redes Wi-Fi: la de credenciales.h y, si está definida, una segunda (por
// ejemplo el hotspot de la laptop en la defensa). Si una no está disponible
// se prueba la otra; cada red tiene la IP de su servidor MQTT.
#ifndef MQTT_SERVIDOR_2
#define MQTT_SERVIDOR_2 MQTT_SERVIDOR
#endif
struct Red {
  const char* ssid;
  const char* clave;
  const char* broker;
};
const Red REDES[] = {
  { WIFI_SSID, WIFI_CLAVE, MQTT_SERVIDOR },
#ifdef WIFI_SSID_2
  { WIFI_SSID_2, WIFI_CLAVE_2, MQTT_SERVIDOR_2 },
#endif
};
const int CANTIDAD_REDES = sizeof(REDES) / sizeof(REDES[0]);
int redActual = 0;

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
  const Red& red = REDES[redActual];
  WiFi.disconnect();
  WiFi.begin(red.ssid, red.clave);
  ultimoIntentoWifi = millis();
  Serial.printf("[WiFi] Conectando a la red \"%s\"...\n", red.ssid);
}

// Avisa cuando la conexión cambia y, si no se logra conectar, explica la
// causa más probable y prueba la otra red (si hay dos).
void vigilarWifi() {
  static bool estabaConectado = false;
  const wl_status_t estado = WiFi.status();
  const bool conectado = estado == WL_CONNECTED;

  if (conectado && !estabaConectado) {
    Serial.printf("[WiFi] Conectado a \"%s\". IP del nodo: %s | señal: %d dBm\n", REDES[redActual].ssid,
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    mqtt.setServer(REDES[redActual].broker, MQTT_PUERTO);
    ultimoIntentoMqtt = 0;
  } else if (!conectado && estabaConectado) {
    Serial.println("[WiFi] Se perdió la conexión; reintentando...");
    ultimoIntentoWifi = millis();
  }
  estabaConectado = conectado;

  if (!conectado && millis() - ultimoIntentoWifi >= ESPERA_RECONEXION_WIFI_MS) {
    if (estado == WL_NO_SSID_AVAIL) {
      Serial.printf("[WiFi] No se encuentra la red \"%s\". El ESP32 solo se conecta a redes de 2,4 GHz (no 5 GHz).\n",
                    REDES[redActual].ssid);
    } else {
      Serial.printf("[WiFi] Sin conexión a \"%s\" (estado %d). Revisa el nombre y la contraseña en credenciales.h.\n",
                    REDES[redActual].ssid, estado);
    }
    redActual = (redActual + 1) % CANTIDAD_REDES;
    conectarWifi();
  }
}

// ----------------------------------------------------------------- MQTT --

void vigilarMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (ultimoIntentoMqtt != 0 && millis() - ultimoIntentoMqtt < ESPERA_RECONEXION_MQTT_MS) return;
  ultimoIntentoMqtt = millis();

  const char* broker = REDES[redActual].broker;
  Serial.printf("[MQTT] Conectando al broker %s:%d...\n", broker, MQTT_PUERTO);
  // Usuario = número de serie, contraseña = MQTT_CLAVE (ver credenciales.h).
#ifdef MQTT_CLAVE
  const bool conectado = mqtt.connect(idCliente, N_SERIE, MQTT_CLAVE);
#else
  const bool conectado = mqtt.connect(idCliente);
#endif
  if (conectado) {
    Serial.printf("[MQTT] Conectado. Publicando en %s\n", topico);
  } else if (mqtt.state() == MQTT_CONNECT_BAD_CREDENTIALS || mqtt.state() == MQTT_CONNECT_UNAUTHORIZED) {
    Serial.printf("[MQTT] El broker rechazó la contraseña del nodo (código %d). Revisa MQTT_CLAVE en credenciales.h "
                  "(se obtiene con: npm run clave-nodo -- %s).\n",
                  mqtt.state(), N_SERIE);
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

// Voltaje en la salida del módulo, en voltios. Toma 31 muestras y usa la
// mediana, que descarta los picos de ruido del ADC; analogReadMilliVolts
// aplica la calibración de fábrica del ESP32.
float leerVoltaje(uint8_t pin, float divisor) {
  const int N = 31;
  uint32_t muestras[N];
  int ceros = 0;
  for (int i = 0; i < N; i++) {
    // El ADC del ESP32 no distingue voltajes por debajo de ~0,1 V: con 0 V la
    // lectura cruda es 0, pero analogReadMilliVolts devuelve unos 140 mV.
    if (analogRead(pin) == 0) ceros++;
    muestras[i] = analogReadMilliVolts(pin);
    delay(8);
  }
  if (ceros > N / 2) return 0.0f;
  for (int i = 1; i < N; i++) {  // ordenamiento por inserción
    const uint32_t v = muestras[i];
    int j = i - 1;
    while (j >= 0 && muestras[j] > v) {
      muestras[j + 1] = muestras[j];
      j--;
    }
    muestras[j + 1] = v;
  }
  return muestras[N / 2] / 1000.0f * divisor;
}

// pH a partir del voltaje del módulo PH-4502C (recta de calibración).
float calcularPh(float voltaje) {
  if (voltaje < 0.05f) return NAN;  // sin señal: módulo desconectado
  const float ph = 7.0f + (PH_VOLTAJE_PH7 - voltaje) / PH_VOLTIOS_POR_UNIDAD;
  return (ph < 0.0f || ph > 14.0f) ? NAN : ph;
}

// Suavizado de la turbidez: promedio de las últimas 5 lecturas (25 s).
// Cerca del agua limpia la curva del sensor es muy empinada: una diferencia
// de un solo paso del ADC (~3 mV en el módulo) equivale a unos 7-10 NTU, y
// la lectura salta entre dos valores vecinos (por ejemplo 0 y 9,6 NTU). El
// promedio entre lecturas deja un valor intermedio estable, sin sumar más de
// unos segundos de demora ante un cambio real.
const int VENTANA_TURBIDEZ = 5;
float historialTurbidez[VENTANA_TURBIDEZ];
int cantidadTurbidez = 0;
int posicionTurbidez = 0;

float suavizarTurbidez(float voltaje) {
  if (voltaje < 0.05f) {  // sin señal: se reinicia el promedio
    cantidadTurbidez = 0;
    posicionTurbidez = 0;
    return voltaje;
  }
  historialTurbidez[posicionTurbidez] = voltaje;
  posicionTurbidez = (posicionTurbidez + 1) % VENTANA_TURBIDEZ;
  if (cantidadTurbidez < VENTANA_TURBIDEZ) cantidadTurbidez++;
  float suma = 0;
  for (int i = 0; i < cantidadTurbidez; i++) suma += historialTurbidez[i];
  return suma / cantidadTurbidez;
}

// Turbidez en NTU con la curva del fabricante (DFRobot SEN0189), válida
// entre 2,5 V (3000 NTU) y 4,2 V (agua limpia). Cada sonda entrega un voltaje
// algo distinto en agua limpia, así que el voltaje se escala para que el de
// agua limpia medido corresponda a los 4,2 V de la curva.
float calcularTurbidez(float voltaje) {
  if (voltaje < 0.05f) return NAN;  // sin señal: módulo desconectado
  const float v = voltaje * (4.20f / TURBIDEZ_VOLTAJE_AGUA_LIMPIA);
  if (v >= 4.20f) return 0.0f;
  if (v <= 2.50f) return 3000.0f;
  const float ntu = -1120.4f * v * v + 5742.3f * v - 4352.9f;
  return ntu < 0.0f ? 0.0f : ntu;
}

// Conductividad en µS/cm con la fórmula del fabricante (DFRobot SEN0244),
// compensada a 25 °C con la temperatura del agua. El TDS en ppm es la mitad.
float calcularConductividad(float voltaje, float temperatura) {
  const float t = isnan(temperatura) ? 25.0f : temperatura;
  const float v = voltaje / (1.0f + 0.02f * (t - 25.0f));
  const float ce = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * CONDUCTIVIDAD_FACTOR;
  return ce < 0.0f ? 0.0f : ce;
}

// Agrega el parámetro al mensaje solo si tiene un valor válido, con 2 decimales.
void agregarParametro(JsonDocument& lectura, const char* nombre, float valor) {
  if (!isnan(valor)) lectura[nombre] = serialized(String(valor, 2));
}

void leerYPublicar() {
  JsonDocument lectura;
  const float temperatura = USAR_TEMPERATURA ? leerTemperatura() : NAN;
  agregarParametro(lectura, "temperatura", temperatura);

  // Línea con los voltajes, para calibrar desde el Monitor Serie.
  String voltajes = "[Voltajes]";
#if USAR_PH
  const float vPh = leerVoltaje(PIN_PH, DIVISOR);
  voltajes += " pH: " + String(vPh, 3) + " V |";
  agregarParametro(lectura, "ph", calcularPh(vPh));
#endif
#if USAR_TURBIDEZ
  const float vTurbidez = suavizarTurbidez(leerVoltaje(PIN_TURBIDEZ, DIVISOR));
  voltajes += " turbidez: " + String(vTurbidez, 3) + " V |";
  agregarParametro(lectura, "turbidez", calcularTurbidez(vTurbidez));
#endif
#if USAR_CONDUCTIVIDAD
  digitalWrite(PIN_ALIMENTACION_TDS, HIGH);  // se enciende solo para esta medición
  delay(ESPERA_ENCENDIDO_TDS_MS);
  const float vConductividad = leerVoltaje(PIN_CONDUCTIVIDAD, 1.0);
  digitalWrite(PIN_ALIMENTACION_TDS, LOW);
  const float conductividad = calcularConductividad(vConductividad, temperatura);
  voltajes += " TDS: " + String(vConductividad, 3) + " V (" + String(conductividad / 2, 0) + " ppm) |";
  agregarParametro(lectura, "conductividad", conductividad);
#endif
  if (voltajes.length() > 10) Serial.println(voltajes);

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
  pinMode(PIN_ALIMENTACION_TDS, OUTPUT);
  digitalWrite(PIN_ALIMENTACION_TDS, LOW);

  snprintf(topico, sizeof(topico), "yakuzone/sensores/%s/lecturas", N_SERIE);
  snprintf(idCliente, sizeof(idCliente), "yakuzone-%s", N_SERIE);
  Serial.printf("\n=== Yakuzone - nodo %s ===\n", N_SERIE);
  Serial.printf("Sensores activos: temperatura %s, pH %s, turbidez %s, conductividad %s\n", USAR_TEMPERATURA ? "sí" : "no",
                USAR_PH ? "sí" : "no", USAR_TURBIDEZ ? "sí" : "no", USAR_CONDUCTIVIDAD ? "sí" : "no");

  if (USAR_TEMPERATURA) {
    sondaTemperatura.begin();
    sondaTemperatura.setResolution(12);
    const int sondas = sondaTemperatura.getDeviceCount();
    if (sondas == 0) {
      Serial.printf("[DS18B20] No se encontró la sonda en el GPIO %d. Revisa el cable de datos y la resistencia de 4,7 kΩ.\n", PIN_DS18B20);
    } else {
      Serial.printf("[DS18B20] Sondas encontradas: %d\n", sondas);
    }
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  mqtt.setServer(REDES[redActual].broker, MQTT_PUERTO);
  mqtt.setSocketTimeout(5);
  conectarWifi();
}

void loop() {
  vigilarWifi();
  vigilarMqtt();
  mqtt.loop();

  // Se lee aunque no haya conexión, para poder probar los sensores desde el
  // Monitor Serie antes de configurar la red.
  if (ultimaLectura == 0 || millis() - ultimaLectura >= INTERVALO_LECTURA_MS) {
    ultimaLectura = millis();
    leerYPublicar();
  }
}
