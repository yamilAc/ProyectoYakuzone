-- Yakuzone - Migración: módulo de mitigación (rol equipo_mitigacion + tabla
-- sugerencias_mitigacion). NO destructiva: no borra nada de lo que ya tengas
-- en usuarios, sensores, lecturas ni alertas.
--
-- Uso:
--   mysql -u root -p yakuDB < migration_mitigacion.sql

USE yakuDB;

ALTER TABLE usuarios
  MODIFY COLUMN rol ENUM('administrador','empleado','equipo_mitigacion') NOT NULL DEFAULT 'empleado';

CREATE TABLE IF NOT EXISTS sugerencias_mitigacion (
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

-- Corrige el typo "Halein" -> "Hallein" en el sensor de ejemplo, si ya lo
-- habías cargado desde una versión anterior de schema.sql.
UPDATE sensores SET ubicacion = REPLACE(ubicacion, 'Halein', 'Hallein') WHERE ubicacion LIKE '%Halein%' LIMIT 1000;
