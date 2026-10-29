-- Yakuzone - Migración: revisión de informes de mitigación. NO destructiva.
-- Correr UNA sola vez, después de migration_whatsapp.sql.
--
-- Nuevo flujo de una alerta: pendiente (sin asignar) -> asignada -> en_revision
-- (el jefe del equipo envió su informe de la visita) -> mitigada (un
-- administrador o empleado aprobó el informe). Si el informe dice que no se
-- pudo realizar, o no convence, la alerta se reasigna para una nueva visita y
-- vuelve a "asignada"; cada visita queda registrada con su informe y fotos.
--
-- Uso:
--   mysql -u root -p yakuDB < migration_revision_informes.sql

USE yakuDB;

ALTER TABLE alertas
  MODIFY COLUMN estado ENUM('pendiente','asignada','en_revision','mitigada') NOT NULL DEFAULT 'pendiente';

-- Informe de cada visita del equipo de mitigación.
CREATE TABLE IF NOT EXISTS informes_mitigacion (
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

-- Las fotos pasan a pertenecer a un informe (una alerta puede tener varias visitas).
ALTER TABLE fotos_mitigacion
  ADD COLUMN informe_id INT NULL AFTER alerta_id,
  ADD INDEX idx_fotos_alerta (alerta_id),
  ADD CONSTRAINT fk_fotos_informe FOREIGN KEY (informe_id) REFERENCES informes_mitigacion(id) ON DELETE CASCADE;

-- Las mitigaciones ya registradas quedan como informes aprobados, con sus fotos.
INSERT INTO informes_mitigacion (alerta_id, equipo_id, resultado, observacion, enviado_por, enviado_en, revision, revisado_por, revisado_en)
SELECT id, equipo_id, 'realizada',
       COALESCE(observacion_mitigacion, 'Mitigación registrada antes de la revisión de informes'),
       mitigado_por, COALESCE(mitigado_en, fecha_hora), 'aprobado', mitigado_por, COALESCE(mitigado_en, fecha_hora)
FROM alertas
WHERE estado = 'mitigada';

UPDATE fotos_mitigacion f
JOIN informes_mitigacion i ON i.alerta_id = f.alerta_id
SET f.informe_id = i.id;

ALTER TABLE fotos_mitigacion
  DROP INDEX uq_foto_alerta_tipo,
  ADD UNIQUE KEY uq_foto_informe_tipo (informe_id, tipo);
