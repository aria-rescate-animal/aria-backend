const pool = require('../db');

// GET /api/notificaciones - Obtener notificaciones del usuario autenticado
const getNotificaciones = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT n.*, r.especie, r.ubicacion 
       FROM notificaciones n
       LEFT JOIN reportes r ON n.reporte_id = r.id
       WHERE n.usuario_id = ?
       ORDER BY n.fecha DESC
       LIMIT 20`,
      [req.user.id]
    );
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

// GET /api/notificaciones/no-leidas - Contar no leídas
const contarNoLeidas = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as total FROM notificaciones WHERE usuario_id = ? AND leida = 0',
      [req.user.id]
    );
    res.status(200).json({ total: rows[0].total });
  } catch (error) {
    res.status(500).json({ error: 'Error al contar notificaciones' });
  }
};

// PATCH /api/notificaciones/:id/leer - Marcar como leída
const marcarLeida = async (req, res) => {
  try {
    await pool.query(
      'UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.user.id]
    );
    res.status(200).json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar notificación' });
  }
};

// PATCH /api/notificaciones/leer-todas - Marcar todas como leídas
const marcarTodasLeidas = async (req, res) => {
  try {
    await pool.query(
      'UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?',
      [req.user.id]
    );
    res.status(200).json({ message: 'Todas las notificaciones marcadas como leídas' });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar notificaciones' });
  }
};

// Función interna para crear notificación (usada por reportes)
const crearNotificacion = async (usuarioId, titulo, mensaje, reporteId = null) => {
  try {
    await pool.query(
      'INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)',
      [usuarioId, titulo, mensaje, reporteId]
    );
  } catch (error) {
    console.error('Error al crear notificación:', error);
  }
};

module.exports = { getNotificaciones, contarNoLeidas, marcarLeida, marcarTodasLeidas, crearNotificacion };
