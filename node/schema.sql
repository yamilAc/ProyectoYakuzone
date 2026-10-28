-- Yakuzone - Esquema de base de datos (MySQL)
-- ADVERTENCIA: este script BORRA y vuelve a crear las tablas usuarios,
-- sensores, lecturas y alertas. Úsalo en tu entorno de desarrollo/demo.
-- Si tu base ya tenía datos en esas tablas (u otras) que quieres conservar,
-- avisa antes de correrlo y se prepara una migración no destructiva.

CREATE DATABASE IF NOT EXISTS yakuDB;
USE yakuDB;

-- Se desactiva temporalmente la verificación de llaves foráneas: si tu
-- base ya tenía una tabla `usuarios` (u otra) de una versión anterior del
-- proyecto, con otras tablas que le hacían referencia, esto evita el error
-- "Cannot delete or update a parent row: a foreign key constraint fails".
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS sugerencias_mitigacion;
DROP TABLE IF EXISTS alertas;
DROP TABLE IF EXISTS lecturas;
DROP TABLE IF EXISTS sensores;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  ci VARCHAR(20) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  contrasenia_hash VARCHAR(255) NOT NULL,
  rol ENUM('administrador','empleado','equipo_mitigacion') NOT NULL DEFAULT 'empleado',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sensores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  n_serie VARCHAR(50) NOT NULL UNIQUE,
  ubicacion VARCHAR(150),
  descripcion VARCHAR(255),
  latitud DECIMAL(10,7),
  longitud DECIMAL(10,7),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lecturas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_id INT NOT NULL,
  valor_temperatura DECIMAL(6,2),
  valor_turbidez DECIMAL(8,2),
  valor_ph DECIMAL(4,2),
  valor_conductividad DECIMAL(8,2),
  fecha_hora DATETIME NOT NULL,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE,
  INDEX idx_lecturas_sensor_fecha (sensor_id, fecha_hora)
);

-- Registro de alertas generadas automáticamente cuando una lectura queda
-- fuera de los rangos de la Norma Boliviana NB 512-04 (ver node/utils/thresholds.js)
CREATE TABLE alertas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lectura_id INT,
  sensor_id INT NOT NULL,
  parametro VARCHAR(30) NOT NULL,
  tipo_alerta VARCHAR(50) NOT NULL,
  valor DECIMAL(8,2),
  descripcion VARCHAR(255),
  fecha_hora DATETIME NOT NULL,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (lectura_id) REFERENCES lecturas(id) ON DELETE SET NULL,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE
);


-- Sugerencias de mitigación generadas por IA (API de Google Gemini) cuando
-- el módulo de alertas confirma que un parámetro se mantiene fuera de rango
-- (ver node/services/mitigacionService.js). Quedan a disposición del equipo
-- de mitigación (nuevo rol de usuario) en el dashboard y por correo.
CREATE TABLE sugerencias_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id INT NOT NULL,
  sensor_id INT NOT NULL,
  parametro VARCHAR(30) NOT NULL,
  valor DECIMAL(8,2),
  rango_referencia VARCHAR(50),
  sugerencia TEXT,
  estado ENUM('pendiente','atendida') NOT NULL DEFAULT 'pendiente',
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  atendido_por INT,
  atendido_en DATETIME,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE CASCADE,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE,
  FOREIGN KEY (atendido_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

SET FOREIGN_KEY_CHECKS = 1;

-- Sensor de ejemplo: punto de monitoreo prototipo en la OTB Urbanización Hallein
INSERT INTO sensores (n_serie, ubicacion, descripcion, latitud, longitud) VALUES
  ('SN-001', 'OTB Urbanización Hallein, Chiquicollo', 'Nodo prototipo de monitoreo (ESP32)', -17.4033631, -66.193527);

-- Usuario administrador de ejemplo para poder entrar la primera vez.
-- Correo: admin@yakuzone.com   Contraseña: Admin123!
-- (cambia esta contraseña apenas puedas ingresar, desde la sección Usuarios)
INSERT INTO usuarios (nombre, apellido, ci, email, contrasenia_hash, rol) VALUES
  ('Admin', 'Yakuzone', '0000000', 'admin@yakuzone.com', '$2b$10$.VqAor7IZDRPz1jQANDGwu2ojXLgRdy6mx3nBvAetGmbqzpBvC2jS', 'administrador');
