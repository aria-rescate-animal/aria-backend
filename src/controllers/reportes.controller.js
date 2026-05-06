const pool = require('../db');

// GET /api/reportes
const getReportes = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM reportes ORDER BY fecha DESC");
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: "Error al cargar reportes" });
  }
};

// GET /api/reportes/:id
const getReporte = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM reportes WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener reporte" });
  }
};

// Notificar SOLO a entidades aprobadas
const notificarAEntidades = async (reporteId, especie, ubicacion) => {
  try {
    const [entidades] = await pool.query(
      "SELECT id FROM usuarios WHERE rol = 'entidad' AND aprobacion_pendiente = 0"
    );
    const titulo = 'Nuevo animal necesita atencion';
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

// POST /api/reportes — Solo ciudadanos crean reportes
const crearReporte = async (req, res) => {
  try {
    if (req.user.rol !== 'ciudadano') {
      return res.status(403).json({ message: 'Solo los ciudadanos pueden crear reportes' });
    }

    const { especie, descripcion, ubicacion } = req.body;
    if (!especie || !descripcion || !ubicacion) {
      return res.status(400).json({ message: 'Especie, descripcion y ubicacion son obligatorios' });
    }

    const fotoUrl = req.file ? req.file.path : null;

    const [usuarios] = await pool.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user.id]);
    const reportadoPor = usuarios.length > 0 ? usuarios[0].nombre : 'Ciudadano';

    const [result] = await pool.query(
      "INSERT INTO reportes (especie, descripcion, ubicacion, foto, estado, reportadoPor, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [especie, descripcion, ubicacion, fotoUrl, 'urgente', reportadoPor, req.user.id]
    );

    // Notificar SOLO a entidades aprobadas
    await notificarAEntidades(result.insertId, especie, ubicacion);

    res.status(201).json({
      message: 'Reporte creado exitosamente',
      reporte: { id: result.insertId, especie, descripcion, ubicacion, foto: fotoUrl, estado: 'urgente', reportadoPor }
    });
  } catch (error) {
    console.error("Error al crear reporte:", error);
    res.status(500).json({ error: "Error al guardar el reporte" });
  }
};

// PATCH /api/reportes/:id/estado — Solo entidades aprobadas
const actualizarEstado = async (req, res) => {
  try {
    if (req.user.rol !== 'entidad' && req.user.rol !== 'administrador') {
      return res.status(403).json({ message: 'Sin permisos para cambiar estado' });
    }

    // Verificar que la entidad esté aprobada
    if (req.user.rol === 'entidad') {
      const [ent] = await pool.query(
        'SELECT aprobacion_pendiente FROM usuarios WHERE id = ?', [req.user.id]
      );
      if (ent.length > 0 && ent[0].aprobacion_pendiente === 1) {
        return res.status(403).json({ message: 'Tu cuenta aun no ha sido aprobada por un administrador' });
      }
    }

    const { estado } = req.body;
    const estadosValidos = ['urgente', 'en proceso', 'rescatado'];
    if (!estado || !estadosValidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado invalido' });
    }

    // Buscar el reporte ANTES del UPDATE para obtener el ciudadano autor
    const [reportes] = await pool.query("SELECT * FROM reportes WHERE id = ?", [req.params.id]);
    if (reportes.length === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    const reporte = reportes[0];

    await pool.query("UPDATE reportes SET estado = ? WHERE id = ?", [estado, req.params.id]);

    // Notificar EXCLUSIVAMENTE al ciudadano que creó el reporte
    if (estado === 'rescatado') {
      await pool.query(
        "INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)",
        [
          reporte.usuario_id,
          'Tu reporte fue rescatado',
          `El ${reporte.especie} que reportaste en "${reporte.ubicacion}" fue rescatado. Gracias por tu ayuda.`,
          reporte.id
        ]
      );
    }

    if (estado === 'en proceso') {
      await pool.query(
        "INSERT INTO notificaciones (usuario_id, titulo, mensaje, reporte_id) VALUES (?, ?, ?, ?)",
        [
          reporte.usuario_id,
          'Tu reporte esta siendo atendido',
          `Una entidad esta atendiendo el caso del ${reporte.especie} que reportaste en "${reporte.ubicacion}".`,
          reporte.id
        ]
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
    const [result] = await pool.query("DELETE FROM reportes WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Reporte no encontrado' });
    res.status(200).json({ message: 'Reporte eliminado' });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar reporte" });
  }
};

module.exports = { getReportes, getReporte, crearReporte, actualizarEstado, eliminarReporte };
