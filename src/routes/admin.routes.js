const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const pool = require('../db');
const { enviarCorreoEntidadAprobada, enviarCorreoEntidadRechazada } = require('../config/email');
const { normalizarCategoria, serviciosCompatiblesCategoria, serviciosToArray, categoriaRequiereRevision } = require('../utils/aria.constants');

const soloAdmin = (req, res, next) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Acceso exclusivo para administradores' });
  next();
};

const soloDigitos = (valor) => String(valor || '').replace(/\D/g, '');

const normalizarTelefonoColombia = (valor) => {
  return soloDigitos(valor);
};

const validarEntidadParaAprobacion = (entidad) => {
  const nit = soloDigitos(entidad.nit);
  const telefono = normalizarTelefonoColombia(entidad.telefono_oficial || entidad.telefono);
  const servicios = serviciosToArray(entidad.servicios_ofrecidos);

  if (!entidad.nombre_organizacion || entidad.nombre_organizacion.trim().length < 3)
    return 'La entidad no tiene un nombre de organización válido.';
  if (!nit || nit.length < 9 || nit.length > 10)
    return 'El NIT debe tener 9 dígitos, o 10 si incluye dígito de verificación, antes de aprobar.';
  if (!telefono || telefono.length !== 10)
    return 'El teléfono oficial debe tener 10 dígitos antes de aprobar.';
  if (!entidad.tipo_entidad)
    return 'La entidad no tiene tipo de entidad definido.';
  if (!entidad.ciudad || entidad.ciudad.trim().length < 2)
    return 'La entidad no tiene ciudad o municipio válido.';
  if (!entidad.representante || entidad.representante.trim().length < 3)
    return 'La entidad no tiene representante válido.';
  if (!entidad.descripcion_entidad || entidad.descripcion_entidad.trim().length < 20)
    return 'La descripción de la entidad debe tener al menos 20 caracteres.';
  if (entidad.descripcion_entidad.trim().length > 800)
    return 'La descripción de la entidad debe tener máximo 800 caracteres.';
  if (servicios.length === 0)
    return 'La entidad no tiene servicios ofrecidos válidos.';
  return null;
};

router.get('/entidades-pendientes', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, email, nit, nombre_organizacion, tipo_entidad,
              telefono_oficial, ciudad, representante, descripcion_entidad,
              servicios_ofrecidos, direccion_sede, enlace_verificacion,
              estado_aprobacion, motivo_rechazo, created_at
       FROM usuarios
       WHERE rol = 'entidad' AND aprobacion_pendiente = 1 AND email_verificado = 1
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener entidades pendientes' });
  }
});

router.patch('/aprobar-entidad/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { accion, motivo } = req.body;
    if (!['aprobar', 'rechazar'].includes(accion))
      return res.status(400).json({ error: 'Acción inválida' });

    const [rows] = await pool.query(
      `SELECT id, nombre, email, nombre_organizacion, nit, tipo_entidad, telefono_oficial, telefono,
              ciudad, representante, descripcion_entidad, servicios_ofrecidos,
              aprobacion_pendiente, estado_aprobacion, bloqueado
       FROM usuarios WHERE id = ? AND rol = "entidad"`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entidad no encontrada' });
    const entidad = rows[0];
    const esPendiente = entidad.aprobacion_pendiente === 1 || entidad.estado_aprobacion === 'pendiente';
    if (!esPendiente) {
      return res.status(400).json({ error: 'Solo puedes aprobar o rechazar entidades pendientes.' });
    }

    if (accion === 'aprobar') {
      const errorAprobacion = validarEntidadParaAprobacion(entidad);
      if (errorAprobacion) return res.status(400).json({ error: errorAprobacion });

      await pool.query(
        `UPDATE usuarios SET
          aprobacion_pendiente = 0, estado_aprobacion = 'aprobada', motivo_rechazo = NULL,
          aprobado_por = ?, aprobado_en = NOW(), bloqueado = 0
         WHERE id = ?`,
        [req.user.id, req.params.id]
      );
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [req.params.id, 'Tu entidad fue aprobada',
         'Tu solicitud fue revisada y aprobada. Ya puedes recibir reportes y gestionar casos.']
      );
      try {
        await enviarCorreoEntidadAprobada(entidad.email, entidad.nombre_organizacion || entidad.nombre);
      } catch (emailErr) {
        console.error('Error correo entidad aprobada:', emailErr.message);
      }
      return res.json({ message: 'Entidad aprobada correctamente.' });
    }

    const motivoFinal = (motivo || 'Solicitud rechazada por el administrador.').trim();
    await pool.query(
      `UPDATE usuarios SET
        aprobacion_pendiente = 0, estado_aprobacion = 'rechazada', motivo_rechazo = ?,
        rechazado_por = ?, rechazado_en = NOW()
       WHERE id = ?`,
      [motivoFinal, req.user.id, req.params.id]
    );
    await pool.query(
      'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
      [req.params.id, 'Solicitud de entidad rechazada',
       `Tu solicitud fue revisada y no fue aprobada. Motivo: ${motivoFinal}`]
    );
    try {
      await enviarCorreoEntidadRechazada(entidad.email, entidad.nombre_organizacion || entidad.nombre, motivoFinal);
    } catch (emailErr) {
      console.error('Error correo entidad rechazada:', emailErr.message);
    }
    res.json({ message: 'Entidad rechazada. El motivo fue guardado.' });
  } catch (err) {
    console.error('Error aprobar/rechazar entidad:', err);
    res.status(500).json({ error: 'Error al procesar la entidad' });
  }
});

// ─── BLOQUEAR / DESBLOQUEAR ENTIDAD ──────────────────────────────────
// Actualiza ambos campos: estado_aprobacion + bloqueado, y notifica.
// Esto es específico para entidades. Para ciudadanos sigue usándose PATCH /usuarios/:id/bloquear.
router.patch('/entidades/:id/bloquear', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { accion } = req.body;
    if (!['bloquear', 'desbloquear'].includes(accion))
      return res.status(400).json({ error: 'Acción inválida. Usa "bloquear" o "desbloquear".' });

    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'No puedes bloquearte a ti mismo.' });

    const [rows] = await pool.query(
      `SELECT id, nombre_organizacion, nombre, rol, estado_aprobacion,
              bloqueado, aprobacion_pendiente
       FROM usuarios WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entidad no encontrada.' });
    const entidad = rows[0];
    if (entidad.rol !== 'entidad')
      return res.status(400).json({ error: 'Esta acción solo aplica para entidades.' });

    if (accion === 'bloquear') {
      if (entidad.estado_aprobacion !== 'aprobada' || entidad.bloqueado === 1 || entidad.aprobacion_pendiente === 1) {
        return res.status(400).json({ error: 'Solo puedes bloquear entidades aprobadas y activas.' });
      }
      await pool.query(
        `UPDATE usuarios
         SET bloqueado = 1, estado_aprobacion = 'bloqueada', aprobacion_pendiente = 0
         WHERE id = ?`,
        [req.params.id]
      );
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [req.params.id, 'Entidad bloqueada',
         'Tu entidad fue bloqueada por el administrador. No podrás recibir nuevos reportes hasta que se reactive.']
      );
      return res.json({ message: 'Entidad bloqueada correctamente.', id: req.params.id, estado_aprobacion: 'bloqueada', bloqueado: 1 });
    }

    if (entidad.estado_aprobacion !== 'bloqueada' || entidad.bloqueado !== 1) {
      return res.status(400).json({ error: 'Solo puedes desbloquear entidades bloqueadas.' });
    }

    // desbloquear → reactivar a aprobada
    await pool.query(
      `UPDATE usuarios SET bloqueado = 0, estado_aprobacion = 'aprobada', aprobacion_pendiente = 0 WHERE id = ?`,
      [req.params.id]
    );
    await pool.query(
      'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
      [req.params.id, 'Entidad reactivada',
       'Tu entidad fue reactivada por el administrador. Ya puedes recibir y gestionar reportes nuevamente.']
    );
    res.json({ message: 'Entidad reactivada correctamente.', id: req.params.id, estado_aprobacion: 'aprobada', bloqueado: 0 });
  } catch (err) {
    console.error('Error bloquear/desbloquear entidad:', err);
    res.status(500).json({ error: 'Error al procesar la acción.' });
  }
});

router.get('/estadisticas', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [[{ total_usuarios }]] = await pool.query('SELECT COUNT(*) as total_usuarios FROM usuarios');
    const [[{ total_reportes }]] = await pool.query('SELECT COUNT(*) as total_reportes FROM reportes');
    const [[{ pendientes }]]     = await pool.query('SELECT COUNT(*) as pendientes FROM usuarios WHERE aprobacion_pendiente = 1 AND email_verificado = 1');
    const [[{ rescatados }]]     = await pool.query("SELECT COUNT(*) as rescatados FROM reportes WHERE estado = 'rescatado'");
    const [[{ bloqueados }]]     = await pool.query('SELECT COUNT(*) as bloqueados FROM usuarios WHERE bloqueado = 1');
    const [[{ invalidos }]]      = await pool.query('SELECT COUNT(*) as invalidos FROM reportes WHERE reportado_invalido = 1');
    res.json({ total_usuarios, total_reportes, pendientes, rescatados, bloqueados, invalidos });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/usuarios', verificarToken, soloAdmin, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM usuarios');
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, bloqueado, aprobacion_pendiente, estado_aprobacion,
              nombre_organizacion, tipo_entidad, servicios_ofrecidos, ciudad, telefono_oficial, telefono,
              nit, representante, descripcion_entidad, direccion_sede, direccion, enlace_verificacion,
              motivo_rechazo, aprobado_en, rechazado_en, created_at
       FROM usuarios ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ usuarios: rows, total, pagina: page, totalPaginas: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.patch('/usuarios/:id/bloquear', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { accion } = req.body;
    if (!['bloquear', 'desbloquear'].includes(accion)) return res.status(400).json({ error: 'Acción inválida' });
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
    const [rows] = await pool.query('SELECT id, nombre, rol FROM usuarios WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (rows[0].rol === 'administrador') return res.status(400).json({ error: 'No se puede bloquear a un administrador' });
    const nuevoBloqueado = accion === 'bloquear' ? 1 : 0;
    await pool.query('UPDATE usuarios SET bloqueado = ? WHERE id = ?', [nuevoBloqueado, req.params.id]);
    const titulo  = accion === 'bloquear' ? 'Cuenta suspendida' : 'Cuenta reactivada';
    const mensaje = accion === 'bloquear' ? 'Tu cuenta ha sido suspendida por el administrador.' : 'Tu cuenta ha sido reactivada.';
    await pool.query('INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)', [req.params.id, titulo, mensaje]);
    res.json({ message: accion === 'bloquear' ? 'Usuario bloqueado' : 'Usuario desbloqueado', id: req.params.id, bloqueado: nuevoBloqueado });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la acción' });
  }
});

router.delete('/usuarios/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    const [rows] = await pool.query('SELECT id, rol FROM usuarios WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (rows[0].rol === 'administrador') return res.status(400).json({ error: 'No se puede eliminar a un administrador' });
    if (rows[0].rol === 'entidad') {
      await pool.query(
        `UPDATE reportes
         SET estado = 'requiere_revision',
             entidad_asignada_id = NULL
         WHERE entidad_asignada_id = ?
           AND estado IN ('pendiente', 'en_atencion')`,
        [id]
      );
    }
    await pool.query('DELETE FROM notificaciones WHERE usuario_id = ?', [id]);
    await pool.query('DELETE FROM mascotas_perdidas WHERE usuario_id = ?', [id]);
    await pool.query('DELETE FROM tokens_recuperacion WHERE usuario_id = ?', [id]);
    await pool.query('UPDATE reportes SET usuario_id = NULL WHERE usuario_id = ?', [id]);
    await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ message: 'Usuario eliminado correctamente', id });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
});

router.get('/reportes-invalidos', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.especie, r.descripcion, r.ubicacion, r.categoria, r.estado,
              r.prioridad, r.motivo_reporte, r.tipo_reporte_invalido, r.fecha,
              r.entidad_asignada_id, r.foto,
              u.nombre AS reportadoPor,
              ent.nombre_organizacion AS entidad_nombre
       FROM reportes r
       LEFT JOIN usuarios u ON r.usuario_id = u.id
       LEFT JOIN usuarios ent ON r.entidad_asignada_id = ent.id
       WHERE r.reportado_invalido = 1
       ORDER BY r.fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reportes inválidos' });
  }
});

router.get('/reportes-sin-entidad', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.especie, r.descripcion, r.ubicacion, r.categoria,
              r.estado, r.prioridad, r.foto, r.fecha,
              u.nombre AS reportadoPor
       FROM reportes r
       LEFT JOIN usuarios u ON r.usuario_id = u.id
       WHERE r.entidad_asignada_id IS NULL
         AND r.reportado_invalido = 0
         AND r.estado IN ('pendiente', 'requiere_revision')
       ORDER BY r.fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reportes sin entidad' });
  }
});

router.delete('/reportes/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM reportes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json({ message: 'Reporte eliminado correctamente', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar reporte' });
  }
});

router.patch('/reportes/:id/asignar', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { entidad_id, nota } = req.body;
    if (!entidad_id) return res.status(400).json({ error: 'Debes especificar la entidad.' });

    const [reportes] = await pool.query('SELECT * FROM reportes WHERE id = ?', [req.params.id]);
    if (reportes.length === 0) return res.status(404).json({ error: 'Reporte no encontrado' });
    const reporte = reportes[0];

    const [ents] = await pool.query(
      `SELECT id, nombre_organizacion, servicios_ofrecidos, aprobacion_pendiente, bloqueado, estado_aprobacion
       FROM usuarios WHERE id = ? AND rol = 'entidad'`,
      [entidad_id]
    );
    if (ents.length === 0) return res.status(400).json({ error: 'La entidad no existe.' });
    const ent = ents[0];
    if (ent.aprobacion_pendiente === 1 || ent.estado_aprobacion !== 'aprobada')
      return res.status(400).json({ error: 'No puedes asignar a una entidad no aprobada.' });
    if (ent.bloqueado === 1)
      return res.status(400).json({ error: 'La entidad seleccionada está bloqueada.' });

    const categoriaNormalizada = normalizarCategoria(reporte.categoria);
    if (categoriaRequiereRevision(categoriaNormalizada)) {
      return res.status(400).json({ error: 'Este reporte requiere revisión administrativa antes de asignarse. Ajusta primero el tipo de caso.' });
    }
    const serviciosEntidad     = serviciosToArray(ent.servicios_ofrecidos);
    const serviciosRequeridos  = serviciosCompatiblesCategoria(categoriaNormalizada);
    const esCompatible         = serviciosRequeridos.length > 0 &&
      serviciosEntidad.some(s => serviciosRequeridos.includes(s));
    if (!esCompatible)
      return res.status(400).json({ error: 'La entidad seleccionada no atiende este tipo de caso.' });

    const notaFinal = nota?.trim() || null;
    const nuevoEstado = reporte.estado === 'requiere_revision' ? 'pendiente' : reporte.estado;
    await pool.query(
      `UPDATE reportes SET
          entidad_asignada_id = ?,
          estado = ?,
          nota_entidad = COALESCE(?, nota_entidad),
          reportado_invalido = 0,
          motivo_reporte = NULL,
          motivo_invalido = NULL,
          tipo_reporte_invalido = NULL
       WHERE id = ?`,
      [entidad_id, nuevoEstado, notaFinal, req.params.id]
    );

    await pool.query(
      'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
      [entidad_id, 'Un reporte fue asignado a tu entidad',
       `Un administrador asignó el caso de ${reporte.especie} a tu entidad.${notaFinal ? ` Nota: ${notaFinal}` : ''}`]
    );
    if (reporte.usuario_id) {
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [reporte.usuario_id, 'Tu reporte fue asignado a una entidad',
         `Tu reporte de ${reporte.especie} fue asignado a "${ent.nombre_organizacion}".`]
      );
    }

    res.json({ message: 'Reporte asignado correctamente.', id: req.params.id, entidad_id });
  } catch (err) {
    console.error('Error asignar reporte:', err);
    res.status(500).json({ error: 'Error al asignar el reporte.' });
  }
});

router.get('/entidades', verificarToken, soloAdmin, async (req, res) => {
  try {
    const categoria = req.query.categoria ? normalizarCategoria(req.query.categoria) : null;
    const [rows] = await pool.query(
      `SELECT id, nombre, nombre_organizacion, tipo_entidad, telefono_oficial, ciudad, servicios_ofrecidos
       FROM usuarios
       WHERE rol = 'entidad' AND aprobacion_pendiente = 0 AND bloqueado = 0 AND estado_aprobacion = 'aprobada'
       ORDER BY nombre_organizacion ASC`
    );
    const requeridos = categoria ? serviciosCompatiblesCategoria(categoria) : [];
    const entidades = rows
      .map(e => ({ ...e, servicios: serviciosToArray(e.servicios_ofrecidos) }))
      .filter(e => !categoria ? true : (!categoriaRequiereRevision(categoria) && requeridos.length > 0 && e.servicios.some(s => requeridos.includes(s))));
    res.json(entidades);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener entidades' });
  }
});

router.get('/broadcast/alcance', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [[{ ciudadanos }]] = await pool.query(
      `SELECT COUNT(*) as ciudadanos FROM usuarios
       WHERE rol = 'ciudadano' AND bloqueado = 0 AND email_verificado = 1 AND id != ?`,
      [req.user.id]
    );
    const [[{ entidades }]] = await pool.query(
      `SELECT COUNT(*) as entidades FROM usuarios
       WHERE rol = 'entidad' AND bloqueado = 0 AND email_verificado = 1
         AND aprobacion_pendiente = 0 AND estado_aprobacion = 'aprobada' AND id != ?`,
      [req.user.id]
    );
    res.json({ ciudadanos, entidades, total: ciudadanos + entidades });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alcance' });
  }
});

router.post('/broadcast', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { titulo, mensaje } = req.body;
    if (!titulo?.trim() || !mensaje?.trim())
      return res.status(400).json({ error: 'Título y mensaje son requeridos' });
    const [destinatarios] = await pool.query(
      `SELECT id, rol FROM usuarios
       WHERE bloqueado = 0 AND email_verificado = 1
         AND id != ?
         AND (
           rol = 'ciudadano'
           OR (rol = 'entidad' AND aprobacion_pendiente = 0 AND estado_aprobacion = 'aprobada')
         )`,
      [req.user.id]
    );
    if (destinatarios.length === 0)
      return res.json({ enviados: 0, ciudadanos: 0, entidades: 0 });
    const values = destinatarios.map(u => [u.id, titulo, mensaje]);
    await pool.query('INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES ?', [values]);
    const ciudadanos = destinatarios.filter(u => u.rol === 'ciudadano').length;
    const entidades  = destinatarios.filter(u => u.rol === 'entidad').length;
    res.json({ enviados: destinatarios.length, ciudadanos, entidades });
  } catch (err) {
    console.error('Error broadcast:', err);
    res.status(500).json({ error: 'Error al enviar el comunicado' });
  }
});

module.exports = router;
