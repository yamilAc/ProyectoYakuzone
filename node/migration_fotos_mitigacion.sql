-- Yakuzone - Migración: fotos de evidencia de la mitigación. NO destructiva.
-- Correr UNA sola vez, después de migration_notificaciones.sql.
--
-- Uso:
--   mysql -u root -p yakuDB < migration_fotos_mitigacion.sql

USE yakuDB;

-- Al marcar una alerta como mitigada, el jefe del equipo sube 3 fotos: el
-- equipo en el lugar, la casa y el trabajo realizado. Los archivos se
-- guardan en node/uploads/mitigaciones/ y aquí solo su nombre.
CREATE TABLE IF NOT EXISTS fotos_mitigacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id INT NOT NULL,
  tipo ENUM('equipo','casa','trabajo') NOT NULL,
  archivo VARCHAR(255) NOT NULL,
  subido_por INT,
  subido_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_foto_alerta_tipo (alerta_id, tipo),
  FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE CASCADE,
  FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL
);
