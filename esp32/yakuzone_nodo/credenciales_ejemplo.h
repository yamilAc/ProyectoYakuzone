// Plantilla de configuración del nodo. Cópiala como "credenciales.h" en esta
// misma carpeta y completa tus datos. credenciales.h no se sube a git.
#pragma once

// Red Wi-Fi de 2,4 GHz (el ESP32 no se conecta a redes de 5 GHz)
#define WIFI_SSID "nombre-de-la-red"
#define WIFI_CLAVE "contrasena-de-la-red"

// IP de la PC donde corre el backend (en PowerShell: ipconfig, "Dirección
// IPv4" del adaptador Wi-Fi) y puerto del broker MQTT (MQTT_PORT del .env)
#define MQTT_SERVIDOR "192.168.1.100"
#define MQTT_PUERTO 1883

// Número de serie con el que el nodo está registrado en la página Sensores
#define N_SERIE "SN-010"
