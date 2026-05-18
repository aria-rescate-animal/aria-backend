const pool = require('../db');
const { validarAnimal } = require('../config/ia');

// GET /api/reportes
const getReportes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, especie, descripcion, ubicacion, latitud, longitud,
              foto, estado, reportadoPor, usuario_id, fecha,
              especie_detectada, es_animal_verificado
       FROM reportes
       ORDER BY fecha DESC`
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
              foto, estado, reportadoPor, fecha,
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
              especie_detectada, es_animal_verificado
       FROM reportes WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener reporte" });
  }
};

// Notificar a entidades aprobadas
const notificarAEntidades = async (reporteId, especie, ubicacion) => {
  try {
    const [entidades] = await pool.query(
      "SELECT id FROM usuarios WHERE rol = 'entidad' AND aprobacion_pendiente = 0"
    );
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

    const { especie, descripcion, ubicacion, latitud, longitud } = req.body;

    if (!especie || !descripcion || !ubicacion) {
      return res.status(400).json({ message: 'Especie, descripcion y ubicacion son obligatorios' });
    }

    if (descripcion.trim().length < 20) {
      return res.status(400).json({ message: 'La descripcion debe tener al menos 20 caracteres' });
    }

    const fotoUrl = req.file ? req.file.path : null;

    // Validar imagen con IA si se subió foto
    let especieDetectada = null;
    let esAnimalVerificado = 0;

    if (fotoUrl) {
      const resultadoIA = await validarAnimal(fotoUrl);

      if (!resultadoIA.error && resultadoIA.esAnimal === false) {
        return res.status(400).json({
          message: 'La imagen no corresponde a un animal. Por favor sube una foto correcta.'
        });
      }

      if (!resultadoIA.error && resultadoIA.esAnimal === true) {
        especieDetectada  = resultadoIA.especieDetectada;
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
        reportadoPor, usuario_id, especie_detectada, es_animal_verificado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        especie, descripcion, ubicacion,
        latitud  ? parseFloat(latitud)  : null,
        longitud ? parseFloat(longitud) : null,
        fotoUrl, 'urgente', reportadoPor, req.user.id,
        especieDetectada, esAnimalVerificado
      ]
    );

    await notificarAEntidades(result.insertId, especie, ubicacion);

    res.status(201).json({
      message: 'Reporte creado exitosamente',
      reporte: {
        id: result.insertId,
        especie,
        descripcion,
        ubicacion,
        latitud:  latitud  ? parseFloat(latitud)  : null,
        longitud: longitud ? parseFloat(longitud) : null,
        foto: fotoUrl,
        estado: 'urgente',
        reportadoPor,
        especie_detectada: especieDetectada,
        es_animal_verificado: esAnimalVerificado
      }
    });
  } catch (error) {
    console.error("Error al crear reporte:", error);
    res.status(500).json({ error: "Error al guardar el reporte" });
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
  actualizarEstado,
  eliminarReporte
};
