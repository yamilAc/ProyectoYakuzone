-- Yakuzone - Esquema de base de datos (MySQL)
-- ADVERTENCIA: este script BORRA y vuelve a crear todas las tablas del
-- sistema (usuarios, sensores, lecturas, equipos de mitigación, alertas,
-- sugerencias, informes y fotos de mitigación). Úsalo en tu entorno de desarrollo/demo.
-- Si tu base ya tenía datos en esas tablas (u otras) que quieres conservar,
-- avisa antes de correrlo y se prepara una migración no destructiva.

CREATE DATABASE IF NOT EXISTS yakuDB;
USE yakuDB;

-- Se desactiva temporalmente la verificación de llaves foráneas: si tu
-- base ya tenía una tabla `usuarios` (u otra) de una versión anterior del
-- proyecto, con otras tablas que le hacían referencia, esto evita el error
-- "Cannot delete or update a parent row: a foreign key constraint fails".
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS fotos_mitigacion;
DROP TABLE IF EXISTS informes_mitigacion;
DROP TABLE IF EXISTS sugerencias_mitigacion;
DROP TABLE IF EXISTS alertas;
DROP TABLE IF EXISTS miembros_equipo;
DROP TABLE IF EXISTS equipos_mitigacion;
DROP TABLE IF EXISTS lecturas;
DROP TABLE IF EXISTS sensores;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  ci VARCHAR(20) NOT NULL,
  -- Celular; obligatorio para los jefes de equipo de mitigación (avisos por WhatsApp)
  telefono VARCHAR(20),
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
  -- Propietario de la vivienda donde está instalado el sensor (para que el
  -- equipo de mitigación sepa a quién contactar y a dónde ir).
  propietario_nombre VARCHAR(150),
  propietario_ci VARCHAR(20),
  propietario_telefono VARCHAR(20),
  propietario_direccion VARCHAR(200),
  propietario_nro_casa VARCHAR(20),
  telefono_emergencia VARCHAR(20),
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

-- Equipos de mitigación: el jefe es el único integrante con usuario en el
-- sistema (rol equipo_mitigacion) y es quien recibe las notificaciones; los
-- demás miembros se registran solo con nombre y teléfono.
CREATE TABLE equipos_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255),
  jefe_id INT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jefe_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE miembros_equipo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  equipo_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20),
  FOREIGN KEY (equipo_id) REFERENCES equipos_mitigacion(id) ON DELETE CASCADE
);

-- Registro de alertas generadas automáticamente cuando una lectura queda
-- fuera de los rangos de la Norma Boliviana NB 512-04 (ver node/utils/thresholds.js).
-- Seguimiento: pendiente (sin asignar) -> asignada (a un equipo, con aviso a
-- su jefe) -> en_revision (el jefe envió el informe de la visita) -> mitigada
-- (un administrador o empleado aprobó el informe). Si el informe no se aprueba,
-- la alerta se reasigna para una nueva visita y vuelve a "asignada".
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
  estado ENUM('pendiente','asignada','en_revision','mitigada') NOT NULL DEFAULT 'pendiente',
  equipo_id INT,
  instrucciones VARCHAR(500),
  asignado_por INT,
  asignado_en DATETIME,
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_enviado TINYINT(1) NOT NULL DEFAULT 0,
  mitigado_por INT,
  mitigado_en DATETIME,
  observacion_mitigacion VARCHAR(500),
  FOREIGN KEY (lectura_id) REFERENCES lecturas(id) ON DELETE SET NULL,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE,
  FOREIGN KEY (equipo_id) REFERENCES equipos_mitigacion(id) ON DELETE SET NULL,
  FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (mitigado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_alertas_estado (estado),
  INDEX idx_alertas_sensor_fecha (sensor_id, fecha_hora)
);


-- Sugerencias de mitigación generadas por IA (API de Google Gemini) cuando
-- el módulo de alertas confirma que un parámetro se mantiene fuera de rango
-- (ver node/services/mitigacionService.js). Se muestran en el detalle de la
-- alerta (Notificaciones) y van en el correo al jefe del equipo asignado.
CREATE TABLE sugerencias_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id INT NOT NULL,
  sensor_id INT NOT NULL,
  parametro VARCHAR(30) NOT NULL,
  valor DECIMAL(8,2),
  rango_referencia VARCHAR(50),
  sugerencia TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE CASCADE,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE
);

-- Informe de cada visita del equipo de mitigación: si la mitigación se
-- realizó o no, qué se hizo, y la revisión del administrador o empleado.
CREATE TABLE informes_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id INT NOT NULL,
  equipo_id INT,
  resultado ENUM('realizada','no_realizada') NOT NULL,
  observacion VARCHAR(500) NOT NULL,
  enviado_por INT,
  enviado_en DATETIME NOT NULL,
  revision ENUM('pendiente','aprobado','rechazado') NOT NULL DEFAULT 'pendiente',
  revisado_por INT,
  revisado_en DATETIME,
  comentario_revision VARCHAR(500),
  FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE CASCADE,
  FOREIGN KEY (equipo_id) REFERENCES equipos_mitigacion(id) ON DELETE SET NULL,
  FOREIGN KEY (enviado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_informes_alerta (alerta_id)
);

-- Fotos de evidencia de cada informe: el equipo en el lugar, la casa y el
-- trabajo realizado. Los archivos se guardan en node/uploads/mitigaciones/ y
-- aquí solo su nombre.
CREATE TABLE fotos_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id INT NOT NULL,
  informe_id INT,
  tipo ENUM('equipo','casa','trabajo') NOT NULL,
  archivo VARCHAR(255) NOT NULL,
  subido_por INT,
  subido_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_foto_informe_tipo (informe_id, tipo),
  INDEX idx_fotos_alerta (alerta_id),
  FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE CASCADE,
  FOREIGN KEY (informe_id) REFERENCES informes_mitigacion(id) ON DELETE CASCADE,
  FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL
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
