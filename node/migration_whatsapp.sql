-- Yakuzone - Migración: avisos por WhatsApp al jefe del equipo de mitigación.
-- NO destructiva. Correr UNA sola vez, después de migration_fotos_mitigacion.sql.
--
-- Uso:
--   mysql -u root -p yakuDB < migration_whatsapp.sql

USE yakuDB;

-- Teléfono (celular) del usuario; obligatorio para los jefes de equipo de
-- mitigación, que reciben por WhatsApp las alertas asignadas a su equipo.
ALTER TABLE usuarios
  ADD COLUMN telefono VARCHAR(20) NULL AFTER ci;

-- Si el aviso por WhatsApp de la asignación salió (igual que correo_enviado).
ALTER TABLE alertas
  ADD COLUMN whatsapp_enviado TINYINT(1) NOT NULL DEFAULT 0 AFTER correo_enviado;
