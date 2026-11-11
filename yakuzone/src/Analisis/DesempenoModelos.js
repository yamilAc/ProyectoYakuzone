import React from 'react';
import { Alert, Box, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import ImagenProtegida from '../components/ImagenProtegida';
import { METODOS_PRONOSTICO, NOMBRES_PARAMETRO, TIPOS_ANOMALIA, porcentaje } from '../utils/analisis';

const num = (valor, decimales = 3) => (valor === null || valor === undefined ? '—' : Number(valor).toFixed(decimales));
const mediaDesv = (m) => (m ? `${num(m.media)} ± ${num(m.desv)}` : '—');

const Celda = ({ children, destacada, ...props }) => (
  <TableCell {...props} sx={{ fontWeight: destacada ? 700 : 400, whiteSpace: 'nowrap', ...(props.sx || {}) }}>
    {children}
  </TableCell>
);

const Figura = ({ nombre, titulo }) => (
  <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
      {titulo}
    </Typography>
    <ImagenProtegida ruta={`/analisis/figuras/${nombre}`} alt={titulo} />
  </Paper>
);

const Seccion = ({ titulo, subtitulo, children }) => (
  <Paper variant="outlined" sx={{ p: 2.5 }}>
    <Typography variant="h6" fontWeight={700}>
      {titulo}
    </Typography>
    {subtitulo && (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {subtitulo}
      </Typography>
    )}
    {children}
  </Paper>
);

const ETIQUETAS_CLASE = { apta: 'Apta', en_riesgo: 'En riesgo', no_apta: 'No apta' };

const Clasificacion = ({ r }) => {
  const nombres = Object.keys(r.modelos);
  const elegido = r.modelos[r.modelo_elegido];
  const regla = r.contraste_nb512.regla_nb512_sobre_lo_medido;
  const descartado = r.conjunto_descartado;
  return (
    <Seccion
      titulo="Clasificación de la calidad del agua"
      subtitulo={`${r.datos.fuente}: ${r.datos.muestras} muestras de ${r.datos.estaciones} estaciones (${r.datos.clases.apta} aptas, ${r.datos.clases.en_riesgo} en riesgo y ${r.datos.clases.no_apta} no aptas). Entradas: lo que mide el nodo (${r.datos.variables.join(', ')}). ${r.datos.entrenamiento} muestras para entrenar y ${r.datos.prueba} reservadas para la prueba final.`}
    >
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        <strong>Etiqueta:</strong> {r.datos.etiqueta} El modelo estima, con lo que mide el sensor, lo que normalmente requiere un análisis de
        laboratorio.
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="body2">Modelo elegido:</Typography>
        <Chip label={r.modelo_elegido} color="primary" size="small" sx={{ fontWeight: 700 }} />
        <Typography variant="caption" color="text.secondary">
          ({r.criterio})
        </Typography>
      </Stack>
      <TableContainer sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <Celda destacada>Modelo</Celda>
              <Celda destacada>Exactitud (VC)</Celda>
              <Celda destacada>Precisión (VC)</Celda>
              <Celda destacada>Sensibilidad (VC)</Celda>
              <Celda destacada>F1 (VC)</Celda>
              <Celda destacada>AUC (VC)</Celda>
              <Celda destacada>F1 en prueba</Celda>
              <Celda destacada>Exactitud en prueba</Celda>
            </TableRow>
          </TableHead>
          <TableBody>
            {nombres.map((nombre) => {
              const m = r.modelos[nombre];
              const esElegido = nombre === r.modelo_elegido;
              return (
                <TableRow key={nombre} sx={{ bgcolor: esElegido ? 'action.selected' : undefined }}>
                  <Celda destacada={esElegido}>{nombre}</Celda>
                  <Celda>{mediaDesv(m.validacion_cruzada_5.exactitud)}</Celda>
                  <Celda>{mediaDesv(m.validacion_cruzada_5.precision)}</Celda>
                  <Celda>{mediaDesv(m.validacion_cruzada_5.sensibilidad)}</Celda>
                  <Celda>{mediaDesv(m.validacion_cruzada_5.f1)}</Celda>
                  <Celda>{mediaDesv(m.validacion_cruzada_5.auc_roc)}</Celda>
                  <Celda destacada={esElegido}>{num(m.prueba.f1)}</Celda>
                  <Celda>{num(m.prueba.exactitud)}</Celda>
                </TableRow>
              );
            })}
            <TableRow>
              <Celda>NB 512-04 sobre lo que mide el sensor (contraste)</Celda>
              <Celda colSpan={5} sx={{ color: 'text.secondary' }}>
                Sin entrenamiento: no ve los parámetros de laboratorio
              </Celda>
              <Celda>{num(regla.f1)}</Celda>
              <Celda>{num(regla.exactitud)}</Celda>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {r.modelo_elegido} por clase (datos de prueba)
      </Typography>
      <TableContainer sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <Celda destacada>Clase</Celda>
              <Celda destacada>Precisión</Celda>
              <Celda destacada>Sensibilidad</Celda>
              <Celda destacada>F1</Celda>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(elegido.prueba.por_clase).map(([clase, m]) => (
              <TableRow key={clase}>
                <Celda>{ETIQUETAS_CLASE[clase] || clase}</Celda>
                <Celda>{num(m.precision)}</Celda>
                <Celda>{num(m.sensibilidad)}</Celda>
                <Celda>{num(m.f1)}</Celda>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="body2" sx={{ mb: 2 }}>
        <strong>Ríos que el modelo no vio</strong> (validación dejando estaciones completas fuera): F1 {num(r.validacion_por_estacion.f1)} y AUC{' '}
        {num(r.validacion_por_estacion.auc_roc)}. Es la medida más exigente de qué tan bien generaliza a una fuente de agua nueva.
      </Typography>

      {descartado && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Conjunto descartado: {descartado.fuente}.</strong> Con las variables del nodo, sus etiquetas de potabilidad no se pueden
          predecir (AUC {num(descartado.auc_con_variables_del_nodo)}, igual al azar; {num(descartado.auc_con_las_9_variables)} con sus 9
          variables), y contradicen la norma: sólidos disueltos promedio de {Math.round(descartado.solidos_disueltos_promedio_mg_l)} mg/L y{' '}
          {descartado.potables_con_ph_fuera_de_6_5_a_9} de {descartado.potables_total} muestras &quot;potables&quot; con pH fuera de 6,5 a 9.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Figura nombre="clasificacion_comparacion" titulo="Comparación de modelos (validación cruzada de 5 particiones)" />
        </Grid>
        <Grid item xs={12} md={6}>
          <Figura nombre="clasificacion_roc" titulo="Curvas ROC para la clase no apta (prueba)" />
        </Grid>
        <Grid item xs={12} md={6}>
          <Figura nombre="clasificacion_matriz_confusion" titulo="Matriz de confusión del modelo elegido (prueba)" />
        </Grid>
        {r.importancia_variables && (
          <Grid item xs={12} md={6}>
            <Figura nombre="clasificacion_importancia" titulo="Importancia de las variables" />
          </Grid>
        )}
      </Grid>
    </Seccion>
  );
};

const Anomalias = ({ r }) => (
  <Seccion
    titulo="Detección de anomalías"
    subtitulo={`${r.modelo}. ${r.datos.fuente}. Entrenamiento: ${r.datos.entrenamiento}; prueba: ${r.datos.prueba}, con anomalías inyectadas de forma controlada.`}
  >
    <Grid container spacing={2} sx={{ mb: 2 }}>
      {[
        ['Eventos detectados', porcentaje(r.prueba.deteccion_por_evento, 1)],
        ['Falsas alarmas por día', num(r.prueba.falsas_alarmas_por_dia, 2)],
        ['AUC ROC', num(r.prueba.auc_roc)],
        ['Precisión (por lectura)', num(r.prueba.precision)],
        ['Sensibilidad (por lectura)', num(r.prueba.sensibilidad)],
        ['Lecturas normales marcadas', porcentaje(r.prueba.tasa_falsas_alarmas, 2)],
      ].map(([titulo, valor]) => (
        <Grid item xs={6} sm={4} md={2} key={titulo}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', height: '100%' }}>
            <Typography variant="h5" fontWeight={700} color="primary.dark">
              {valor}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {titulo}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
    <TableContainer sx={{ mb: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Celda destacada>Tipo de anomalía inyectada</Celda>
            <Celda destacada>Eventos</Celda>
            <Celda destacada>Eventos detectados</Celda>
            <Celda destacada>Lecturas anómalas</Celda>
            <Celda destacada>Lecturas detectadas</Celda>
            <Celda destacada>Causa diagnosticada bien</Celda>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(r.prueba_por_tipo).map(([tipo, d]) => (
            <TableRow key={tipo}>
              <Celda>{TIPOS_ANOMALIA[tipo]?.label || tipo}</Celda>
              <Celda>{d.eventos}</Celda>
              <Celda>
                {d.eventos_detectados} ({porcentaje(d.deteccion_por_evento, 1)})
              </Celda>
              <Celda>{d.lecturas_anomalas}</Celda>
              <Celda>
                {d.detectadas} ({porcentaje(d.sensibilidad, 1)})
              </Celda>
              <Celda>{porcentaje(r.diagnostico_de_causa[tipo]?.exactitud, 1)}</Celda>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Un evento cuenta como detectado si al menos una de sus lecturas se marca. {r.regla_congelada}. El umbral se eligió para no superar 1 % de
      lecturas normales marcadas en validación. Además, el modelo marcó {r.lecturas_reales_marcadas.total} lecturas reales (no inyectadas) del periodo de prueba; pueden ser eventos
      reales del río, como lluvias, más que errores del modelo.
    </Typography>
    <Grid container spacing={2}>
      <Grid item xs={12} md={7}>
        <Figura nombre="anomalias_serie_prueba" titulo="Anomalías inyectadas y detectadas (dos semanas de prueba)" />
      </Grid>
      <Grid item xs={12} md={5}>
        <Figura nombre="anomalias_puntajes" titulo="Distribución de puntajes y umbral elegido" />
      </Grid>
    </Grid>
  </Seccion>
);

const Pronostico = ({ r }) => {
  const horizontes = ['1 h', '2 h', '3 h'];
  return (
    <Seccion
      titulo="Pronóstico de series temporales"
      subtitulo={`${r.modelo}. ${r.datos.fuente}. Validación: ${r.datos.validacion}; prueba: ${r.datos.prueba}. Horizonte: ${r.datos.horizonte}.`}
    >
      {Object.entries(r.parametros).map(([parametro, p]) => (
        <Box key={parametro} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {NOMBRES_PARAMETRO[parametro]}
            </Typography>
            <Chip size="small" color="primary" label={`Método elegido: ${METODOS_PRONOSTICO[p.metodo_elegido]}`} />
            <Typography variant="caption" color="text.secondary">
              ARIMA({p.orden_arima.join(', ')})
            </Typography>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <Celda destacada>Método</Celda>
                  {horizontes.map((h) => (
                    <Celda destacada key={h}>
                      MAE {h}
                    </Celda>
                  ))}
                  <Celda destacada>RMSE 3 h</Celda>
                  <Celda destacada>MAE promedio</Celda>
                  <Celda destacada>Mejora vs. persistencia</Celda>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(p.prueba).map(([metodo, m]) => (
                  <TableRow key={metodo} sx={{ bgcolor: metodo === p.metodo_elegido ? 'action.selected' : undefined }}>
                    <Celda destacada={metodo === p.metodo_elegido}>{METODOS_PRONOSTICO[metodo]}</Celda>
                    {horizontes.map((h) => (
                      <Celda key={h}>{num(m[`mae_${h}`])}</Celda>
                    ))}
                    <Celda>{num(m['rmse_3 h'])}</Celda>
                    <Celda>{num(m.mae_promedio)}</Celda>
                    <Celda>{metodo === 'persistencia' ? 'Base' : `${p.mejora_vs_persistencia_pct[metodo]} %`}</Celda>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Figura nombre="pronostico_mae" titulo="MAE por método y horizonte (prueba)" />
        </Grid>
        <Grid item xs={12} md={6}>
          <Figura nombre="pronostico_ejemplo" titulo="Ejemplo de pronóstico a 3 horas" />
        </Grid>
      </Grid>
    </Seccion>
  );
};

// Desempeño de los tres modelos, tal como lo midieron los scripts de
// entrenamiento (ml/entrenamiento): métricas y figuras para el documento.
const DesempenoModelos = ({ metricas }) => {
  if (!metricas) {
    return <Alert severity="warning">El servicio de aprendizaje automático no está disponible; no se pueden mostrar las métricas.</Alert>;
  }
  return (
    <Stack spacing={2.5}>
      {metricas.clasificacion ? <Clasificacion r={metricas.clasificacion} /> : <Alert severity="info">El modelo de clasificación todavía no se entrenó.</Alert>}
      {metricas.anomalias ? <Anomalias r={metricas.anomalias} /> : <Alert severity="info">El modelo de anomalías todavía no se entrenó.</Alert>}
      {metricas.pronostico ? <Pronostico r={metricas.pronostico} /> : <Alert severity="info">El modelo de pronóstico todavía no se entrenó.</Alert>}
    </Stack>
  );
};

export default DesempenoModelos;
