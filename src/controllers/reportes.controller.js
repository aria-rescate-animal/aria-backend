const pool = require('../db');
const { validarAnimal } = require('../config/ia');

// GET /api/reportes
const getReportes = async (req, res) => {
  try {
    const { categoria } = req.query;
    const condiciones = [];
    const valores = [];

    if (categoria) {
      condiciones.push('r.categoria = ?');
      valores.push(categoria);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT r.id, r.especie, r.descripcion, r.ubicacion, r.latitud, r.longitud,
              r.foto, r.estado, r.reportadoPor, r.usuario_id, r.fecha,
              r.especie_detectada, r.es_animal_verificado,
              r.categoria, r.reportado_invalido, r.motivo_reporte,
              r.entidad_asignada_id
       FROM reportes r
       ${where}
       ORDER BY r.fecha DESC`,
      valores
    );
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: "Error al cargar reportes" });
  }
};

// GET /api/reportes/mis-reportes
const getMisReportes = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(20, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) as total FROM reportes WHERE usuario_id = ?',
      [req.user.id]
    );

    const [rows] = await pool.query(
      `SELECT id, especie, descripcion, ubicacion, latitud, longitud,
              foto, estado, reportadoPor, fecha, categoria,
              especie_detectada, es_animal_verificado
       FROM reportes
       WHERE usuario_id = ?
       ORDER BY fecha DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    res.status(200).json({
      reportes: rows,
      total,
      pagina: page,
      totalPaginas: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: "Error al cargar tus reportes" });
  }
};

// GET /api/reportes/:id
const getReporte = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, especie, descripcion, ubicacion, latitud, longitud,
              foto, estado, reportadoPor, usuario_id, fecha,
              especie_detectada, es_animal_verificado, categoria,
              reportado_invalido, motivo_reporte, entidad_asignada_id
       FROM reportes WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener reporte" });
  }
};

// Notificar entidades
const notificarAEntidades = async (reporteId, especie, ubicacion, entidadAsignadaId) => {
  try {
    let entidades;

    if (entidadAsignadaId) {
      // Notificar solo a la entidad asignada
      const [rows] = await pool.query(
        "SELECT id FROM usuarios WHERE id = ? AND rol = 'entidad' AND aprobacion_pendiente = 0",
        [entidadAsignadaId]
      );
      entidades = rows;
    } else {
      // Notificar a todas las entidades aprobadas
      const [rows] = await pool.query(
        "SELECT id FROM usuarios WHERE rol = 'entidad' AND aprobacion_pendiente = 0"
      );
      entidades = rows;
    }

    const titulo  = 'Nuevo animal necesita atencion';
    const mensaje = `Un ciudadano reporto un ${especie} en situacion de calle en ${ubicacion}. Revisa el caso.`;

    for (const entidad of entidades) {
      await pool.query(
        "INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)",
        [entidad.id, titulo, mensaje, reporteId]
      );
    }
  } catch (err) {
    console.error("Error al notificar entidades:", err);
  }
};

// POST /api/reportes
const crearReporte = async (req, res) => {
  try {
    if (req.user.rol !== 'ciudadano') {
      return res.status(403).json({ message: 'Solo los ciudadanos pueden crear reportes' });
    }

    const { especie, descripcion, ubicacion, latitud, longitud, categoria, entidad_asignada_id } = req.body;

    if (!especie || !descripcion || !ubicacion) {
      return res.status(400).json({ message: 'Especie, descripcion y ubicacion son obligatorios' });
    }

    if (descripcion.trim().length < 20) {
      return res.status(400).json({ message: 'La descripcion debe tener al menos 20 caracteres' });
    }

    const categoriaFinal = ['herido','enfermo','abandonado','desnutrido','otro'].includes(categoria)
      ? categoria : 'otro';

    const fotoUrl = req.file ? req.file.path : null;

    let especieDetectada   = null;
    let esAnimalVerificado = 0;

    if (fotoUrl) {
      const resultadoIA = await validarAnimal(fotoUrl);

      if (resultadoIA.error) {
        return res.status(503).json({
          message: 'El servicio de verificacion de imagenes no esta disponible. Por favor intenta de nuevo en unos minutos.'
        });
      }

      if (resultadoIA.esAnimal === false) {
        return res.status(400).json({
          message: 'La imagen no corresponde a un animal. Por favor sube una foto correcta.'
        });
      }

      if (resultadoIA.esAnimal === true) {
        especieDetectada   = resultadoIA.especieDetectada;
        esAnimalVerificado = 1;
      }
    }

    const [usuarios] = await pool.query(
      "SELECT nombre FROM usuarios WHERE id = ?",
      [req.user.id]
    );
    const reportadoPor = usuarios.length > 0 ? usuarios[0].nombre : 'Ciudadano';

    const [result] = await pool.query(
      `INSERT INTO reportes
       (especie, descripcion, ubicacion, latitud, longitud, foto, estado,
        reportadoPor, usuario_id, especie_detectada, es_animal_verificado,
        categoria, entidad_asignada_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        especie, descripcion, ubicacion,
        latitud  ? parseFloat(latitud)  : null,
        longitud ? parseFloat(longitud) : null,
        fotoUrl, 'urgente', reportadoPor, req.user.id,
        especieDetectada, esAnimalVerificado,
        categoriaFinal,
        entidad_asignada_id || null
      ]
    );

    await notificarAEntidades(result.insertId, especie, ubicacion, entidad_asignada_id || null);

    res.status(201).json({
      message: 'Reporte creado exitosamente',
      reporte: {
        id: result.insertId,
        especie, descripcion, ubicacion,
        latitud:  latitud  ? parseFloat(latitud)  : null,
        longitud: longitud ? parseFloat(longitud) : null,
        foto: fotoUrl, estado: 'urgente', reportadoPor,
        especie_detectada: especieDetectada,
        es_animal_verificado: esAnimalVerificado,
        categoria: categoriaFinal,
        entidad_asignada_id: entidad_asignada_id || null
      }
    });
  } catch (error) {
    console.error("Error al crear reporte:", error);
    res.status(500).json({ error: "Error al guardar el reporte" });
  }
};

// POST /api/reportes/:id/reportar — Solo entidades
const reportarInvalido = async (req, res) => {
  try {
    if (req.user.rol !== 'entidad') {
      return res.status(403).json({ message: 'Solo las entidades pueden reportar casos invalidos' });
    }

    const { motivo } = req.body;
    if (!motivo || motivo.trim().length < 10) {
      return res.status(400).json({ message: 'Debes indicar el motivo del reporte (minimo 10 caracteres)' });
    }

    const [reportes] = await pool.query(
      'SELECT id, especie, ubicacion FROM reportes WHERE id = ?',
      [req.params.id]
    );
    if (reportes.length === 0) return res.status(404).json({ message: 'Reporte no encontrado' });

    await pool.query(
      'UPDATE reportes SET reportado_invalido = 1, motivo_reporte = ? WHERE id = ?',
      [motivo.trim(), req.params.id]
    );

    // Notificar al administrador
    const [admins] = await pool.query(
      "SELECT id FROM usuarios WHERE rol = 'administrador'"
    );

    for (const admin of admins) {
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)',
        [
          admin.id,
          '⚠️ Reporte marcado como invalido',
          `Una entidad reporto el caso #${req.params.id} (${reportes[0].especie} en ${reportes[0].ubicacion}) como invalido. Motivo: ${motivo}`,
          req.params.id
        ]
      );
    }

    res.status(200).json({
      message: 'Reporte enviado al administrador para revision',
      id: req.params.id,
      reportado_invalido: true
    });
  } catch (error) {
    console.error("Error al reportar invalido:", error);
    res.status(500).json({ error: "Error al reportar el caso" });
  }
};

// PATCH /api/reportes/:id/estado
const actualizarEstado = async (req, res) => {
  try {
    if (req.user.rol !== 'entidad' && req.user.rol !== 'administrador') {
      return res.status(403).json({ message: 'Sin permisos para cambiar estado' });
    }

    if (req.user.rol === 'entidad') {
      const [ent] = await pool.query(
        'SELECT aprobacion_pendiente FROM usuarios WHERE id = ?',
        [req.user.id]
      );
      if (ent.length > 0 && ent[0].aprobacion_pendiente === 1) {
        return res.status(403).json({ message: 'Tu cuenta aun no ha sido aprobada' });
      }
    }

    const { estado } = req.body;
    const estadosValidos = ['urgente', 'en proceso', 'rescatado'];
    if (!estado || !estadosValidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado invalido' });
    }

    const [reportes] = await pool.query(
      "SELECT * FROM reportes WHERE id = ?",
      [req.params.id]
    );
    if (reportes.length === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    const reporte = reportes[0];

    await pool.query(
      "UPDATE reportes SET estado = ? WHERE id = ?",
      [estado, req.params.id]
    );

    if (estado === 'rescatado') {
      await pool.query(
        "INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)",
        [reporte.usuario_id,
         'Tu reporte fue rescatado',
         `El ${reporte.especie} que reportaste en "${reporte.ubicacion}" fue rescatado. Gracias por tu ayuda.`,
         reporte.id]
      );
    }

    if (estado === 'en proceso') {
      await pool.query(
        "INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)",
        [reporte.usuario_id,
         'Tu reporte esta siendo atendido',
         `Una entidad esta atendiendo el caso del ${reporte.especie} que reportaste en "${reporte.ubicacion}".`,
         reporte.id]
      );
    }

    res.status(200).json({ message: 'Estado actualizado', id: req.params.id, estado });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar estado" });
  }
};

// DELETE /api/reportes/:id
const eliminarReporte = async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM reportes WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.status(200).json({ message: 'Reporte eliminado' });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar reporte" });
  }
};

module.exports = {
  getReportes,
  getMisReportes,
  getReporte,
  crearReporte,
  reportarInvalido,
  actualizarEstado,
  eliminarReporte
};
