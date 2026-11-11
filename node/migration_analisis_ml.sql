-- Yakuzone - Migración: resultados de los modelos de aprendizaje automático
-- (servicio ml/) y alertas preventivas. NO destructiva. Correr UNA sola vez,
-- después de migration_revision_informes.sql.
--
-- Uso:
--   mysql -u root -p yakuDB < migration_analisis_ml.sql

USE yakuDB;

-- Clasificación (apta / en riesgo / no apta) y detección de anomalías de
-- cada lectura, calculadas por el servicio de aprendizaje automático.
CREATE TABLE IF NOT EXISTS analisis_lecturas (
  lectura_id INT PRIMARY KEY,
  sensor_id INT NOT NULL,
  fecha_hora DATETIME NOT NULL,
  clase ENUM('apta','en_riesgo','no_apta'),
  clase_modelo ENUM('apta','en_riesgo','no_apta'),
  probabilidad_apta DECIMAL(5,4),
  cumple_nb512 TINYINT(1),
  puntaje_anomalia DECIMAL(5,4),
  es_anomalia TINYINT(1) NOT NULL DEFAULT 0,
  tipo_anomalia VARCHAR(30),
  parametros_anomalia VARCHAR(100),
  analizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lectura_id) REFERENCES lecturas(id) ON DELETE CASCADE,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE,
  INDEX idx_analisis_sensor_fecha (sensor_id, fecha_hora)
);

-- Pronósticos a 3 horas de pH, turbidez y conductividad. `puntos` guarda la
-- lista [{fecha_hora, valor}] en formato JSON (MySQL 5.6 no tiene tipo JSON).
CREATE TABLE IF NOT EXISTS pronosticos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_id INT NOT NULL,
  parametro VARCHAR(30) NOT NULL,
  metodo VARCHAR(20) NOT NULL,
  generado_en DATETIME NOT NULL,
  puntos TEXT NOT NULL,
  fuera_de_rango TEXT,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE,
  INDEX idx_pronosticos_sensor (sensor_id, parametro, generado_en)
);

-- Alertas preventivas: lecturas anómalas y pronósticos fuera de la NB 512-04.
-- Son informativas (no pasan por el flujo de equipos de mitigación). Una
-- misma situación que se repite se acumula en la misma alerta (detecciones).
CREATE TABLE IF NOT EXISTS alertas_preventivas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_id INT NOT NULL,
  origen ENUM('anomalia','pronostico') NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  parametros VARCHAR(100),
  lectura_id INT,
  valor DECIMAL(10,3),
  fecha_prevista DATETIME,
  descripcion VARCHAR(500) NOT NULL,
  creada_en DATETIME NOT NULL,
  ultima_deteccion DATETIME NOT NULL,
  detecciones INT NOT NULL DEFAULT 1,
  vista TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (sensor_id) REFERENCES sensores(id) ON DELETE CASCADE,
  FOREIGN KEY (lectura_id) REFERENCES lecturas(id) ON DELETE SET NULL,
  INDEX idx_preventivas_busqueda (sensor_id, origen, tipo, ultima_deteccion),
  INDEX idx_preventivas_vista (vista)
);
