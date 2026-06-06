const pool = require('../db');
const { validarAnimal } = require('../config/ia');
const { normalizarCategoria, serviciosCompatiblesCategoria, serviciosToArray, categoriaRequiereRevision } = require('../utils/aria.constants');

// ── Transiciones de estado válidas por rol ──────────────────────
const TRANSICIONES_VALIDAS = {
  entidad: {
    pendiente:   ['en_atencion', 'no_procede', 'requiere_revision'],
    en_atencion: ['rescatado', 'no_procede', 'requiere_revision'],
  },
  administrador: {
    pendiente:         ['en_atencion', 'rescatado', 'no_procede', 'requiere_revision'],
    en_atencion:       ['rescatado', 'no_procede', 'requiere_revision', 'pendiente'],
    rescatado:         ['pendiente'],
    no_procede:        ['pendiente', 'en_atencion'],
    requiere_revision: ['pendiente', 'en_atencion', 'no_procede'],
  },
};

// GET /api/reportes/rescatados-publicos — público, sin ubicación sensible
const getRescatadosPublicos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.especie, r.descripcion, r.foto,
              r.categoria, r.prioridad, r.nota_entidad,
              r.fecha, r.rescatado_en,
              u.nombre_organizacion AS entidad_nombre
       FROM reportes r
       LEFT JOIN usuarios u ON r.entidad_asignada_id = u.id
       WHERE r.estado = 'rescatado'
         AND r.reportado_invalido = 0
       ORDER BY r.rescatado_en DESC, r.fecha DESC
       LIMIT 20`
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('getRescatadosPublicos:', error.message);
    res.status(500).json({ error: 'Error al cargar rescatados.' });
  }
};

const getReportes = async (req, res) => {
  try {
    const { categoria, prioridad } = req.query;
    const conds = [], vals = [];

    if (categoria) { conds.push('r.categoria = ?'); vals.push(categoria); }
    if (prioridad)  { conds.push('r.prioridad = ?'); vals.push(prioridad); }

    if (req.user.rol === 'ciudadano') {
      return res.status(403).json({ message: 'Los ciudadanos deben usar /mis-reportes.' });
    }
    if (req.user.rol === 'entidad') {
      const [entidad] = await pool.query(
        `SELECT aprobacion_pendiente, bloqueado, estado_aprobacion
         FROM usuarios WHERE id = ? AND rol = 'entidad'`,
        [req.user.id]
      );
      const ent = entidad[0];
      if (!ent || ent.aprobacion_pendiente === 1 || ent.bloqueado === 1 || ent.estado_aprobacion !== 'aprobada') {
        return res.status(403).json({ message: 'Tu entidad no está habilitada para operar.' });
      }
      conds.push('r.entidad_asignada_id = ?');
      vals.push(req.user.id);
      conds.push('r.reportado_invalido = 0');
      conds.push("r.estado <> 'requiere_revision'");
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT r.id, r.especie, r.descripcion, r.ubicacion, r.latitud, r.longitud,
              r.foto, r.estado, r.prioridad, r.reportadoPor, r.usuario_id, r.fecha,
              r.especie_detectada, r.es_animal_verificado,
              r.categoria, r.reportado_invalido, r.motivo_reporte,
              r.entidad_asignada_id, r.nota_entidad, r.asumido_en, r.rescatado_en,
              u.nombre_organizacion AS entidad_nombre,
              u.tipo_entidad        AS entidad_tipo
       FROM reportes r
       LEFT JOIN usuarios u ON r.entidad_asignada_id = u.id
       ${where}
       ORDER BY CASE r.prioridad WHEN 'urgente' THEN 0 ELSE 1 END, r.fecha DESC`,
      vals
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('getReportes:', error.message);
    res.status(500).json({ error: 'Error al cargar reportes.' });
  }
};

const getMisReportes = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(20, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const estadosPermitidos = ['pendiente', 'en_atencion', 'rescatado', 'no_procede', 'requiere_revision'];
    const estado = estadosPermitidos.includes(req.query.estado) ? req.query.estado : null;
    const filtros = ['r.usuario_id = ?', 'r.reportado_invalido = 0'];
    const valores = [req.user.id];

    if (estado) {
      filtros.push('r.estado = ?');
      valores.push(estado);
    }

    const where = filtros.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM reportes r WHERE ${where}`,
      valores
    );
    const [rows] = await pool.query(
      `SELECT r.id, r.especie, r.descripcion, r.ubicacion, r.foto,
              r.estado, r.prioridad, r.reportadoPor, r.fecha, r.categoria,
              r.especie_detectada, r.es_animal_verificado,
              r.nota_entidad, r.asumido_en, r.rescatado_en,
              r.entidad_asignada_id,
              u.nombre_organizacion AS entidad_nombre,
              u.tipo_entidad        AS entidad_tipo
       FROM reportes r
       LEFT JOIN usuarios u ON r.entidad_asignada_id = u.id
       WHERE ${where}
       ORDER BY r.fecha DESC
       LIMIT ? OFFSET ?`,
      [...valores, limit, offset]
    );
    res.status(200).json({ reportes: rows, total, pagina: page, totalPaginas: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar tus reportes.' });
  }
};

const getReporte = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.nombre_organizacion AS entidad_nombre, u.tipo_entidad AS entidad_tipo
       FROM reportes r
       LEFT JOIN usuarios u ON r.entidad_asignada_id = u.id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Reporte no encontrado.' });
    const r = rows[0];
    if (req.user.rol === 'ciudadano' && r.usuario_id !== req.user.id)
      return res.status(403).json({ message: 'No tienes permiso para ver este reporte.' });
    if (req.user.rol === 'entidad' && (r.entidad_asignada_id !== req.user.id || r.estado === 'requiere_revision' || r.reportado_invalido === 1))
      return res.status(403).json({ message: 'Este reporte no está asignado a tu entidad.' });
    res.status(200).json(r);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener reporte.' });
  }
};

const notificarEntidad = async (entidadId, titulo, mensaje) => {
  try {
    await pool.query(
      'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
      [entidadId, titulo, mensaje]
    );
  } catch (e) { console.error('notificarEntidad:', e.message); }
};

const crearReporte = async (req, res) => {
  try {
    if (req.user.rol !== 'ciudadano')
      return res.status(403).json({ message: 'Solo los ciudadanos pueden crear reportes.' });

    const { especie, descripcion, ubicacion, categoria, prioridad, entidad_asignada_id, latitud, longitud } = req.body;

    if (!especie || !descripcion || !ubicacion)
      return res.status(400).json({ message: 'Especie, descripción y ubicación son obligatorios.' });
    if (descripcion.trim().length < 20)
      return res.status(400).json({ message: 'La descripción debe tener al menos 20 caracteres.' });

    if (!req.file)
      return res.status(400).json({ message: 'La imagen del animal es obligatoria.' });

    const categoriaFinal = normalizarCategoria(categoria);
    const requiereRevisionPorCategoria = categoriaRequiereRevision(categoriaFinal);
    const prioridadFinal = prioridad === 'urgente' ? 'urgente' : 'normal';
    const latNum = latitud !== undefined && latitud !== null && latitud !== '' ? Number(latitud) : null;
    const lngNum = longitud !== undefined && longitud !== null && longitud !== '' ? Number(longitud) : null;
    const latFinal = Number.isFinite(latNum) ? latNum : null;
    const lngFinal = Number.isFinite(lngNum) ? lngNum : null;
    const fotoUrl = req.file.path;

    const resultadoIA = await validarAnimal(fotoUrl);
    if (resultadoIA.error)
      return res.status(503).json({ message: 'No se pudo validar la imagen en este momento. Inténtalo nuevamente.' });
    if (resultadoIA.esAnimal === false)
      return res.status(400).json({ message: 'La imagen no corresponde a un animal real. Por favor sube una fotografía real del animal.' });

    const especieDetectada   = resultadoIA.especieDetectada || null;
    const esAnimalVerificado = 1;

    let entidadId     = requiereRevisionPorCategoria ? null : (entidad_asignada_id ? parseInt(entidad_asignada_id) : null);
    let entidadNombre = null;
    let estadoInicial = requiereRevisionPorCategoria ? 'requiere_revision' : 'pendiente';

    if (entidadId) {
      const [entRows] = await pool.query(
        `SELECT id, nombre_organizacion, aprobacion_pendiente, bloqueado, servicios_ofrecidos, estado_aprobacion
         FROM usuarios WHERE id = ? AND rol = 'entidad'`,
        [entidadId]
      );
      if (entRows.length === 0)
        return res.status(400).json({ message: 'La entidad seleccionada no existe.' });
      const ent = entRows[0];
      if (ent.aprobacion_pendiente === 1 || ent.estado_aprobacion !== 'aprobada')
        return res.status(400).json({ message: 'No puedes enviar el reporte a esta entidad porque no está aprobada.' });
      if (ent.bloqueado === 1)
        return res.status(400).json({ message: 'La entidad seleccionada no está disponible para recibir reportes.' });

      const serviciosEntidad  = serviciosToArray(ent.servicios_ofrecidos);
      const serviciosRequeridos = serviciosCompatiblesCategoria(categoriaFinal);
      const esCompatible = serviciosRequeridos.length > 0 &&
        serviciosEntidad.some(s => serviciosRequeridos.includes(s));
      if (!esCompatible)
        return res.status(400).json({ message: 'La entidad seleccionada no atiende este tipo de caso.' });

      entidadNombre = ent.nombre_organizacion;
    } else {
      estadoInicial = 'requiere_revision';
    }

    const [usuarios] = await pool.query('SELECT nombre FROM usuarios WHERE id = ?', [req.user.id]);
    const reportadoPor = usuarios[0]?.nombre || 'Ciudadano';

    const [result] = await pool.query(
      `INSERT INTO reportes
       (especie, descripcion, ubicacion, latitud, longitud, foto, estado, prioridad,
        reportadoPor, usuario_id, especie_detectada, es_animal_verificado,
        categoria, entidad_asignada_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [especie, descripcion, ubicacion, latFinal, lngFinal, fotoUrl, estadoInicial, prioridadFinal,
       reportadoPor, req.user.id, especieDetectada, esAnimalVerificado,
       categoriaFinal, entidadId]
    );

    if (entidadId && entidadNombre) {
      await notificarEntidad(entidadId,
        'Nuevo reporte enviado a tu entidad',
        `${reportadoPor} envió un reporte de ${especie} en "${ubicacion}".`
      );
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [req.user.id, 'Reporte enviado', `Tu reporte fue enviado a "${entidadNombre}".`]
      );
    } else {
      const [admins] = await pool.query("SELECT id FROM usuarios WHERE rol = 'administrador'");
      for (const a of admins) {
        await pool.query(
          'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
          [a.id, 'Nuevo reporte requiere asignación', `Nuevo reporte de ${especie} sin entidad asignada.`]
        );
      }
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [req.user.id, 'Reporte enviado a revisión', requiereRevisionPorCategoria
          ? 'Seleccionaste “No estoy seguro”. Un administrador revisará el caso y lo asignará a una entidad adecuada.'
          : 'Tu reporte fue enviado a revisión administrativa. Un administrador lo asignará pronto.']
      );
    }

    res.status(201).json({
      message: 'Reporte creado exitosamente.',
      reporte: { id: result.insertId, especie, estado: estadoInicial, prioridad: prioridadFinal, entidad_nombre: entidadNombre }
    });
  } catch (error) {
    console.error('crearReporte:', error.message);
    res.status(500).json({ error: 'Error al guardar el reporte.' });
  }
};

const reportarInvalido = async (req, res) => {
  try {
    if (req.user.rol !== 'entidad')
      return res.status(403).json({ message: 'Solo las entidades pueden reportar casos.' });

    const [ent] = await pool.query(
      `SELECT aprobacion_pendiente, bloqueado, estado_aprobacion
       FROM usuarios WHERE id = ? AND rol = 'entidad'`,
      [req.user.id]
    );
    const entidad = ent[0];
    if (!entidad || entidad.aprobacion_pendiente === 1 || entidad.bloqueado === 1 || entidad.estado_aprobacion !== 'aprobada') {
      return res.status(403).json({ message: 'Tu entidad no está habilitada para operar.' });
    }

    const [reportes] = await pool.query(
      'SELECT id, especie, entidad_asignada_id, usuario_id FROM reportes WHERE id = ?',
      [req.params.id]
    );
    if (reportes.length === 0) return res.status(404).json({ message: 'Reporte no encontrado.' });
    if (reportes[0].entidad_asignada_id !== req.user.id)
      return res.status(403).json({ message: 'Este reporte no está asignado a tu entidad.' });

    const { motivo } = req.body;
    const tipo = req.body.tipo === 'no_corresponde' ? 'no_corresponde' : 'posible_falso';
    if (!motivo || motivo.trim().length < 5)
      return res.status(400).json({ message: 'Debes indicar el motivo (mínimo 5 caracteres).' });

    await pool.query(
      `UPDATE reportes
       SET reportado_invalido = 1,
           motivo_reporte = ?,
           tipo_reporte_invalido = ?,
           estado = 'requiere_revision'
       WHERE id = ?`,
      [motivo.trim(), tipo, req.params.id]
    );

    const [admins] = await pool.query("SELECT id FROM usuarios WHERE rol = 'administrador'");
    const tipoLabel = tipo === 'no_corresponde' ? 'No corresponde a la entidad' : 'Posible falso';
    for (const a of admins) {
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [a.id, 'Un reporte requiere revisión',
         `${tipoLabel} — caso #${req.params.id} (${reportes[0].especie}). Motivo: ${motivo}`]
      );
    }

    if (reportes[0].usuario_id) {
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
        [
          reportes[0].usuario_id,
          'Tu reporte está en revisión',
          `La entidad reportó el caso de ${reportes[0].especie} para revisión administrativa. Motivo: ${motivo.trim()}`
        ]
      );
    }

    res.status(200).json({ message: 'Reporte enviado a revisión del administrador.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Error al reportar el caso.' });
  }
};

const actualizarEstado = async (req, res) => {
  try {
    if (req.user.rol !== 'entidad' && req.user.rol !== 'administrador')
      return res.status(403).json({ message: 'Sin permisos para cambiar estado.' });

    if (req.user.rol === 'entidad') {
      const [ent] = await pool.query(
        'SELECT aprobacion_pendiente, bloqueado, estado_aprobacion FROM usuarios WHERE id = ?', [req.user.id]
      );
      if (ent[0]?.aprobacion_pendiente === 1)
        return res.status(403).json({ message: 'Tu cuenta aún no ha sido aprobada.' });
      if (ent[0]?.bloqueado === 1)
        return res.status(403).json({ message: 'Tu cuenta está suspendida.' });
      if (ent[0]?.estado_aprobacion !== 'aprobada')
        return res.status(403).json({ message: 'Tu entidad no está habilitada para operar.' });
    }

    const { estado, nota } = req.body;
    const estadosValidos = ['pendiente','en_atencion','rescatado','no_procede','requiere_revision'];
    if (!estadosValidos.includes(estado))
      return res.status(400).json({ message: 'Estado inválido.' });

    const [reportes] = await pool.query('SELECT * FROM reportes WHERE id = ?', [req.params.id]);
    if (reportes.length === 0) return res.status(404).json({ message: 'Reporte no encontrado.' });
    const reporte = reportes[0];

    if (req.user.rol === 'entidad' && reporte.entidad_asignada_id !== req.user.id)
      return res.status(403).json({ message: 'Este reporte no está asignado a tu entidad.' });

    const transiciones = TRANSICIONES_VALIDAS[req.user.rol];
    const permitidos   = transiciones?.[reporte.estado] || [];
    if (req.user.rol !== 'administrador' && !permitidos.includes(estado))
      return res.status(409).json({
        message: `No se puede pasar de "${reporte.estado}" a "${estado}".`,
        estadoActual: reporte.estado
      });

    const updates  = { estado };
    const notaFinal = nota?.trim() || null;
    if (notaFinal) updates.nota_entidad = notaFinal;
    if (estado === 'en_atencion' && !reporte.asumido_en)  updates.asumido_en  = new Date();
    if (estado === 'rescatado')                            updates.rescatado_en = new Date();

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE reportes SET ${setClause} WHERE id = ?`, [...Object.values(updates), req.params.id]);

    if (reporte.usuario_id) {
      const [entRow] = req.user.rol === 'entidad'
        ? await pool.query('SELECT nombre_organizacion FROM usuarios WHERE id = ?', [req.user.id])
        : [[]];
      const nombreEnt = entRow[0]?.nombre_organizacion || 'Una entidad';

      const notifMap = {
        en_atencion: {
          titulo:  `${nombreEnt} asumió tu reporte`,
          mensaje: `${nombreEnt} está atendiendo el caso del ${reporte.especie}.${notaFinal ? ` Nota: ${notaFinal}` : ''}`
        },
        rescatado: {
          titulo:  'Tu reporte fue marcado como rescatado',
          mensaje: `El ${reporte.especie} que reportaste fue rescatado.${notaFinal ? ` Nota: ${notaFinal}` : ' Gracias por tu ayuda.'}`
        },
        no_procede: {
          titulo:  'Actualización de tu reporte',
          mensaje: `El caso del ${reporte.especie} fue marcado como no procede.${notaFinal ? ` Nota: ${notaFinal}` : ''}`
        },
      };

      if (notifMap[estado]) {
        await pool.query(
          'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
          [reporte.usuario_id, notifMap[estado].titulo, notifMap[estado].mensaje]
        );
      }
    }

    res.status(200).json({ message: 'Estado actualizado.', id: req.params.id, estado, nota: notaFinal });
  } catch (error) {
    console.error('actualizarEstado:', error.message);
    res.status(500).json({ error: 'Error al actualizar estado.' });
  }
};

const eliminarReporte = async (req, res) => {
  try {
    if (req.user.rol !== 'administrador')
      return res.status(403).json({ message: 'Solo administradores pueden eliminar reportes.' });
    const [result] = await pool.query('DELETE FROM reportes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Reporte no encontrado.' });
    res.status(200).json({ message: 'Reporte eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar reporte.' });
  }
};

module.exports = {
  getRescatadosPublicos,
  getReportes,
  getMisReportes,
  getReporte,
  crearReporte,
  reportarInvalido,
  actualizarEstado,
  eliminarReporte,
};
