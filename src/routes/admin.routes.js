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
    const [[{ pendientes }]]     = await pool.query('SELECT COUNT(*) as pendientes FROM usuarios WHERE aprobacion_pendiente = 1');
    const [[{ rescatados }]]     = await pool.query("SELECT COUNT(*) as rescatados FROM reportes WHERE estado = 'rescatado'");
    const [[{ bloqueados }]]     = await pool.query('SELECT COUNT(*) as bloqueados FROM usuarios WHERE bloqueado = 1');
    res.json({ total_usuarios, total_reportes, pendientes, rescatados, bloqueados });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
});

// GET /api/admin/usuarios — Lista todos los usuarios paginada
router.get('/usuarios', verificarToken, soloAdmin, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM usuarios');

    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, bloqueado, aprobacion_pendiente, created_at
       FROM usuarios
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      usuarios: rows,
      total,
      pagina: page,
      totalPaginas: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// PATCH /api/admin/usuarios/:id/bloquear — Bloquear o desbloquear un usuario
router.patch('/usuarios/:id/bloquear', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { accion } = req.body;

    if (!['bloquear', 'desbloquear'].includes(accion)) {
      return res.status(400).json({ error: 'Accion invalida. Usa "bloquear" o "desbloquear"' });
    }

    // No permitir que el admin se bloquee a si mismo
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
    }

    const [rows] = await pool.query('SELECT id, nombre, rol FROM usuarios WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    // No permitir bloquear a otro administrador
    if (rows[0].rol === 'administrador') {
      return res.status(400).json({ error: 'No se puede bloquear a un administrador' });
    }

    const nuevoBloqueado = accion === 'bloquear' ? 1 : 0;
    await pool.query('UPDATE usuarios SET bloqueado = ? WHERE id = ?', [nuevoBloqueado, req.params.id]);

    // Notificar al usuario afectado
    const titulo  = accion === 'bloquear' ? 'Cuenta suspendida' : 'Cuenta reactivada';
    const mensaje = accion === 'bloquear'
      ? 'Tu cuenta ha sido suspendida por el administrador. Contacta al soporte si crees que es un error.'
      : 'Tu cuenta ha sido reactivada. Ya puedes volver a iniciar sesion.';

    await pool.query(
      'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
      [req.params.id, titulo, mensaje]
    );

    res.json({
      message: accion === 'bloquear' ? 'Usuario bloqueado correctamente' : 'Usuario desbloqueado correctamente',
      id: req.params.id,
      bloqueado: nuevoBloqueado
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar la accion' });
  }
});

module.exports = router;
