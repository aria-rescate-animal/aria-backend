const pool = require('../db');

// GET /api/reportes - Obtener todos los reportes
const getReportes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM reportes ORDER BY fecha DESC"
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error al obtener reportes:", error);
    res.status(500).json({ error: "Error al cargar el feed de reportes" });
  }
};

// GET /api/reportes/:id - Obtener un reporte
const getReporte = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM reportes WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el reporte" });
  }
};

// POST /api/reportes - Crear un nuevo reporte
const crearReporte = async (req, res) => {
  try {
    const { especie, descripcion, ubicacion, foto } = req.body;

    if (!especie || !descripcion || !ubicacion) {
      return res.status(400).json({ message: 'Especie, descripción y ubicación son obligatorios' });
    }

    // Obtener nombre del usuario desde el token
    const [usuarios] = await pool.query(
      "SELECT nombre FROM usuarios WHERE id = ?",
      [req.user.id]
    );

    const reportadoPor = usuarios.length > 0 ? usuarios[0].nombre : 'Usuario';

    const [result] = await pool.query(
      "INSERT INTO reportes (especie, descripcion, ubicacion, foto, estado, reportadoPor, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [especie, descripcion, ubicacion, foto || null, 'urgente', reportadoPor, req.user.id]
    );

    res.status(201).json({
      message: 'Reporte creado exitosamente',
      reporte: {
        id: result.insertId,
        especie,
        descripcion,
        ubicacion,
        foto: foto || null,
        estado: 'urgente',
        reportadoPor,
        usuario_id: req.user.id
      }
    });
  } catch (error) {
    console.error("Error al crear reporte:", error);
    res.status(500).json({ error: "Error al guardar el reporte" });
  }
};

// PATCH /api/reportes/:id/estado - Actualizar estado
const actualizarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    const estadosValidos = ['urgente', 'en proceso', 'rescatado'];

    if (!estado || !estadosValidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido. Usa: urgente, en proceso, rescatado' });
    }

    const [result] = await pool.query(
      "UPDATE reportes SET estado = ? WHERE id = ?",
      [estado, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    res.status(200).json({
      message: 'Estado actualizado correctamente',
      id: req.params.id,
      estado
    });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar el estado" });
  }
};

// DELETE /api/reportes/:id - Eliminar reporte
const eliminarReporte = async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM reportes WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    res.status(200).json({ message: 'Reporte eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el reporte" });
  }
};

module.exports = { getReportes, getReporte, crearReporte, actualizarEstado, eliminarReporte };
