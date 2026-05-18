const pool          = require('../db');
const { validarAnimal } = require('../config/ia');

// GET /api/mascotas-perdidas
const getMascotas = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(20, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    // Filtros opcionales
    const { zona, especie, fecha } = req.query;
    const condiciones = ["estado = 'perdido'"];
    const valores     = [];

    if (zona) {
      condiciones.push('zona LIKE ?');
      valores.push(`%${zona}%`);
    }
    if (especie) {
      condiciones.push('especie LIKE ?');
      valores.push(`%${especie}%`);
    }
    if (fecha) {
      condiciones.push('DATE(fecha) = ?');
      valores.push(fecha);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM mascotas_perdidas ${where}`,
      valores
    );

    const [rows] = await pool.query(
      `SELECT m.id, m.nombre, m.especie, m.foto, m.descripcion,
              m.zona, m.contacto, m.estado, m.fecha, m.usuario_id,
              u.nombre as dueno
       FROM mascotas_perdidas m
       JOIN usuarios u ON m.usuario_id = u.id
       ${where}
       ORDER BY m.fecha DESC
       LIMIT ? OFFSET ?`,
      [...valores, limit, offset]
    );

    res.status(200).json({
      mascotas: rows,
      total,
      pagina: page,
      totalPaginas: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error getMascotas:', error);
    res.status(500).json({ error: 'Error al cargar mascotas perdidas' });
  }
};

// POST /api/mascotas-perdidas
const crearMascota = async (req, res) => {
  try {
    if (req.user.rol !== 'ciudadano') {
      return res.status(403).json({ message: 'Solo los ciudadanos pueden publicar mascotas perdidas' });
    }

    const { nombre, especie, descripcion, zona, contacto } = req.body;

    if (!nombre || !especie || !descripcion || !zona || !contacto) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios: nombre, especie, descripcion, zona y contacto' });
    }

    if (descripcion.trim().length < 20) {
      return res.status(400).json({ message: 'La descripcion debe tener al menos 20 caracteres' });
    }

    const fotoUrl = req.file ? req.file.path : null;

    // Validar imagen con IA si se subió foto
    if (fotoUrl) {
      const resultadoIA = await validarAnimal(fotoUrl);

      if (resultadoIA.error) {
        return res.status(503).json({
          message: 'El servicio de verificacion de imagenes no esta disponible. Por favor intenta de nuevo en unos minutos.'
        });
      }

      if (resultadoIA.esAnimal === false) {
        return res.status(400).json({
          message: 'La imagen no corresponde a un animal. Por favor sube una foto correcta de tu mascota.'
        });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO mascotas_perdidas
       (usuario_id, nombre, especie, foto, descripcion, zona, contacto)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, nombre, especie, fotoUrl, descripcion, zona, contacto]
    );

    res.status(201).json({
      message: 'Mascota publicada correctamente',
      mascota: {
        id: result.insertId,
        nombre, especie, foto: fotoUrl,
        descripcion, zona, contacto,
        estado: 'perdido'
      }
    });
  } catch (error) {
    console.error('Error crearMascota:', error);
    res.status(500).json({ error: 'Error al publicar mascota perdida' });
  }
};

// PATCH /api/mascotas-perdidas/:id/encontrada
const marcarEncontrada = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, usuario_id, nombre FROM mascotas_perdidas WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Publicacion no encontrada' });
    }

    // Solo el dueño puede marcarla como encontrada
    if (rows[0].usuario_id !== req.user.id) {
      return res.status(403).json({ message: 'Solo el dueno puede marcar su mascota como encontrada' });
    }

    await pool.query(
      "UPDATE mascotas_perdidas SET estado = 'encontrado' WHERE id = ?",
      [req.params.id]
    );

    res.status(200).json({
      message: `¡Qué alegría! ${rows[0].nombre} fue marcada como encontrada.`,
      id: req.params.id,
      estado: 'encontrado'
    });
  } catch (error) {
    console.error('Error marcarEncontrada:', error);
    res.status(500).json({ error: 'Error al actualizar el estado' });
  }
};

module.exports = { getMascotas, crearMascota, marcarEncontrada };
