const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const pool = require('../db');

const soloAdmin = (req, res, next) => {
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso exclusivo para administradores' });
  }
  next();
};

// GET /api/admin/entidades-pendientes
router.get('/entidades-pendientes', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, email, nit, nombre_organizacion, tipo_entidad, 
              telefono_oficial, direccion_sede, enlace_verificacion, created_at 
       FROM usuarios 
       WHERE rol = 'entidad' AND aprobacion_pendiente = 1
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener entidades pendientes' });
  }
});

// PATCH /api/admin/aprobar-entidad/:id
router.patch('/aprobar-entidad/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { accion } = req.body;
    if (!['aprobar', 'rechazar'].includes(accion)) {
      return res.status(400).json({ error: 'Accion invalida' });
    }
    if (accion === 'aprobar') {
      await pool.query(
        'UPDATE usuarios SET aprobacion_pendiente = 0 WHERE id = ? AND rol = "entidad"',
        [req.params.id]
      );
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [req.params.id, 'Cuenta aprobada', 'Tu cuenta como entidad ha sido aprobada. Ya puedes gestionar los casos de rescate.']
      );
      res.json({ message: 'Entidad aprobada correctamente' });
    } else {
      await pool.query('DELETE FROM usuarios WHERE id = ? AND rol = "entidad"', [req.params.id]);
      res.json({ message: 'Entidad rechazada y eliminada' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la entidad' });
  }
});

// GET /api/admin/estadisticas
router.get('/estadisticas', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [[{ total_usuarios }]] = await pool.query('SELECT COUNT(*) as total_usuarios FROM usuarios');
    const [[{ total_reportes }]] = await pool.query('SELECT COUNT(*) as total_reportes FROM reportes');
    const [[{ pendientes }]] = await pool.query('SELECT COUNT(*) as pendientes FROM usuarios WHERE aprobacion_pendiente = 1');
    const [[{ rescatados }]] = await pool.query("SELECT COUNT(*) as rescatados FROM reportes WHERE estado = 'rescatado'");
    res.json({ total_usuarios, total_reportes, pendientes, rescatados });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
});

module.exports = router;
