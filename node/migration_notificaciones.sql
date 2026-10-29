-- Yakuzone - Migración: rediseño de Notificaciones (datos del propietario de
-- cada sensor, equipos de mitigación con jefe y asignación de alertas).
-- NO destructiva: no borra nada de lo que ya tengas en usuarios, sensores,
-- lecturas, alertas ni sugerencias_mitigacion. Correr UNA sola vez (MySQL
-- 5.6 no admite "ADD COLUMN IF NOT EXISTS"; si se corre dos veces, el primer
-- ALTER falla con "Duplicate column name" y no cambia nada más).
--
-- Uso:
--   mysql -u root -p yakuDB < migration_notificaciones.sql

USE yakuDB;

-- Datos del propietario de la vivienda donde está instalado cada sensor, para
-- que el equipo de mitigación sepa a quién contactar y a dónde ir.
ALTER TABLE sensores
  ADD COLUMN propietario_nombre VARCHAR(150) NULL AFTER longitud,
  ADD COLUMN propietario_ci VARCHAR(20) NULL AFTER propietario_nombre,
  ADD COLUMN propietario_telefono VARCHAR(20) NULL AFTER propietario_ci,
  ADD COLUMN propietario_direccion VARCHAR(200) NULL AFTER propietario_telefono,
  ADD COLUMN propietario_nro_casa VARCHAR(20) NULL AFTER propietario_direccion,
  ADD COLUMN telefono_emergencia VARCHAR(20) NULL AFTER propietario_nro_casa;

-- Equipos de mitigación: el jefe es el único integrante con usuario en el
-- sistema (rol equipo_mitigacion) y es quien recibe las notificaciones; los
-- demás miembros se registran solo con nombre y teléfono.
CREATE TABLE IF NOT EXISTS equipos_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255),
  jefe_id INT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jefe_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS miembros_equipo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  equipo_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20),
  FOREIGN KEY (equipo_id) REFERENCES equipos_mitigacion(id) ON DELETE CASCADE
);

-- Seguimiento de cada alerta: pendiente (sin equipo) -> asignada (a un
-- equipo, con correo a su jefe) -> mitigada (el jefe o un administrador
-- registra lo que se hizo).
ALTER TABLE alertas
  ADD COLUMN estado ENUM('pendiente','asignada','mitigada') NOT NULL DEFAULT 'pendiente' AFTER leida,
  ADD COLUMN equipo_id INT NULL AFTER estado,
  ADD COLUMN instrucciones VARCHAR(500) NULL AFTER equipo_id,
  ADD COLUMN asignado_por INT NULL AFTER instrucciones,
  ADD COLUMN asignado_en DATETIME NULL AFTER asignado_por,
  ADD COLUMN correo_enviado TINYINT(1) NOT NULL DEFAULT 0 AFTER asignado_en,
  ADD COLUMN mitigado_por INT NULL AFTER correo_enviado,
  ADD COLUMN mitigado_en DATETIME NULL AFTER mitigado_por,
  ADD COLUMN observacion_mitigacion VARCHAR(500) NULL AFTER mitigado_en,
  ADD CONSTRAINT fk_alertas_equipo FOREIGN KEY (equipo_id) REFERENCES equipos_mitigacion(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_alertas_asignado_por FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_alertas_mitigado_por FOREIGN KEY (mitigado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD INDEX idx_alertas_estado (estado),
  ADD INDEX idx_alertas_sensor_fecha (sensor_id, fecha_hora);

-- Las sugerencias que ya se habían marcado como atendidas desde la antigua
-- página de Mitigación pasan a ser alertas mitigadas. Desde ahora el estado
-- vive en `alertas`; las columnas estado, correo_enviado, atendido_por y
-- atendido_en de sugerencias_mitigacion quedan solo como registro histórico.
UPDATE alertas a
JOIN sugerencias_mitigacion m ON m.alerta_id = a.id
SET a.estado = 'mitigada', a.mitigado_por = m.atendido_por, a.mitigado_en = m.atendido_en
WHERE m.estado = 'atendida';
