const pool = require('../db');

const getNotificaciones = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, usuario_id, titulo, mensaje, leida, fecha
       FROM notificaciones
       WHERE usuario_id = ?
       ORDER BY fecha DESC
       LIMIT 20`,
      [req.user.id]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error getNotificaciones:', error.message);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

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

module.exports = { getNotificaciones, contarNoLeidas, marcarLeida, marcarTodasLeidas };
