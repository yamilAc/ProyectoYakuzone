-- Agrega 3 sensores adicionales a los ya existentes, sin borrar nada.
-- Representan otras viviendas del mismo sector monitoreado (OTB
-- Urbanización Halein, Chiquicollo) para poder demostrar cómo se vería el
-- sistema con varios nodos activos, mientras se instala el hardware real.
--
-- Uso:
--   mysql -u root -p yakuDB < seed_sensores_adicionales.sql

USE yakuDB;

INSERT INTO sensores (n_serie, ubicacion, descripcion, latitud, longitud)
SELECT 'SN-002', 'OTB Urbanización Halein, Chiquicollo', 'Nodo de monitoreo — Vivienda 2', -17.4038, -66.192800
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sensores WHERE n_serie = 'SN-002');

INSERT INTO sensores (n_serie, ubicacion, descripcion, latitud, longitud)
SELECT 'SN-003', 'OTB Urbanización Halein, Chiquicollo', 'Nodo de monitoreo — Vivienda 3', -17.402900, -66.194200
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sensores WHERE n_serie = 'SN-003');

INSERT INTO sensores (n_serie, ubicacion, descripcion, latitud, longitud)
SELECT 'SN-004', 'OTB Urbanización Halein, Chiquicollo', 'Nodo de monitoreo — Vivienda 4', -17.404100, -66.191800
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sensores WHERE n_serie = 'SN-004');
