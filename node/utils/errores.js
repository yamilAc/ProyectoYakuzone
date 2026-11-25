// Respuesta para errores inesperados (fallas de la base de datos, etc.): el
// detalle queda solo en la consola del servidor y al cliente se le envía un
// mensaje genérico, para no revelar nombres de tablas, columnas ni consultas.
function errorInterno(res, err, contexto = 'API') {
  console.error(`[${contexto}] ${res.req ? `${res.req.method} ${res.req.originalUrl}: ` : ''}${err && err.message}`);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Ocurrió un error interno; intenta nuevamente' });
  }
}

module.exports = { errorInterno };
