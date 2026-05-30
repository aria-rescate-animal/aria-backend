const pool = require('../db')
const { validarAnimal } = require('../config/ia')

const ESTADOS_MASCOTA = ['perdido', 'encontrado', 'cerrada']

const normalizarTelefono = (tel) => {
  if (!tel) return { valido: false, error: 'El teléfono de contacto es obligatorio.' }
  const str = String(tel).trim()
  if (/[a-zA-Z]/.test(str)) return { valido: false, error: 'El teléfono no puede contener letras.' }
  const soloDigitos = str.replace(/[^0-9]/g, '')
  if (soloDigitos.length !== 10) {
    return { valido: false, error: 'El número de contacto debe tener 10 dígitos.' }
  }
  if (!soloDigitos.startsWith('3')) {
    return { valido: false, error: 'El número de contacto debe iniciar con 3.' }
  }
  return { valido: true, normalizado: soloDigitos }
}

const getMascotas = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(20, parseInt(req.query.limit) || 20)
    const offset = (page - 1) * limit

    const estado = ESTADOS_MASCOTA.includes(req.query.estado) ? req.query.estado : 'perdido'
    const { zona, especie, fecha, q } = req.query
    const condiciones = ['m.estado = ?']
    const valores = [estado]

    if (zona) { condiciones.push('m.zona LIKE ?'); valores.push(`%${String(zona).trim()}%`) }
    if (especie) { condiciones.push('m.especie LIKE ?'); valores.push(`%${String(especie).trim()}%`) }
    if (fecha) { condiciones.push('DATE(m.fecha) = ?'); valores.push(fecha) }
    if (q && String(q).trim()) {
      const busqueda = `%${String(q).trim()}%`
      condiciones.push('(m.nombre LIKE ? OR m.especie LIKE ? OR m.zona LIKE ? OR m.descripcion LIKE ?)')
      valores.push(busqueda, busqueda, busqueda, busqueda)
    }

    const where = `WHERE ${condiciones.join(' AND ')}`
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM mascotas_perdidas m ${where}`, valores)
    const [rows] = await pool.query(
      `SELECT m.id, m.nombre, m.especie, m.foto, m.descripcion,
              m.zona, m.estado, m.fecha, m.usuario_id, m.encontrado_en, m.cerrada_en,
              u.nombre as dueno, m.contacto as contacto_raw
       FROM mascotas_perdidas m
       JOIN usuarios u ON m.usuario_id = u.id
       ${where}
       ORDER BY m.fecha DESC
       LIMIT ? OFFSET ?`,
      [...valores, limit, offset]
    )

    const isAuth = !!req.user
    const mascotas = rows.map(m => ({ ...m, contacto: isAuth ? m.contacto_raw : null, contacto_raw: undefined }))
    res.status(200).json({ mascotas, total, pagina: page, totalPaginas: Math.ceil(total / limit), estado })
  } catch (error) {
    console.error('Error getMascotas:', error)
    res.status(500).json({ error: 'Error al cargar mascotas perdidas' })
  }
}

const crearMascota = async (req, res) => {
  try {
    if (req.user.rol !== 'ciudadano') {
      return res.status(403).json({ message: 'Solo los ciudadanos pueden publicar mascotas perdidas.' })
    }

    const { nombre, especie, descripcion, zona, contacto } = req.body
    if (!nombre || !especie || !descripcion || !zona || !contacto) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios: nombre, especie, descripción, zona y contacto.' })
    }
    if (descripcion.trim().length < 20) {
      return res.status(400).json({ message: 'La descripción debe tener al menos 20 caracteres.' })
    }

    const telResult = normalizarTelefono(contacto)
    if (!telResult.valido) return res.status(400).json({ message: telResult.error })

    if (!req.file) return res.status(400).json({ message: 'La foto de la mascota es obligatoria.' })

    const fotoUrl = req.file.path
    const resultadoIA = await validarAnimal(fotoUrl)
    if (resultadoIA.error) {
      return res.status(503).json({ message: 'No se pudo validar la imagen en este momento. Inténtalo nuevamente.' })
    }
    if (resultadoIA.esAnimal === false) {
      return res.status(400).json({ message: 'La imagen no corresponde a un animal real. Por favor sube una foto correcta de tu mascota.' })
    }

    const [result] = await pool.query(
      `INSERT INTO mascotas_perdidas
       (usuario_id, nombre, especie, foto, descripcion, zona, contacto, validacion_ia, especie_ia, confianza_ia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, nombre.trim(), especie.trim(), fotoUrl, descripcion.trim(), zona.trim(), telResult.normalizado,
       1, resultadoIA.especieDetectada || null, resultadoIA.confianza || null]
    )

    res.status(201).json({
      message: 'Mascota publicada correctamente.',
      mascota: { id: result.insertId, nombre: nombre.trim(), especie: especie.trim(), foto: fotoUrl, descripcion: descripcion.trim(), zona: zona.trim(), contacto: telResult.normalizado, estado: 'perdido' }
    })
  } catch (error) {
    console.error('Error crearMascota:', error)
    res.status(500).json({ error: 'Error al publicar mascota perdida.' })
  }
}

const marcarEncontrada = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, usuario_id, nombre FROM mascotas_perdidas WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ message: 'Publicación no encontrada.' })
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ message: 'Solo el dueño puede marcar su mascota como encontrada.' })

    await pool.query("UPDATE mascotas_perdidas SET estado = 'encontrado', encontrado_en = NOW() WHERE id = ?", [req.params.id])
    res.status(200).json({ message: `¡Qué alegría! ${rows[0].nombre} fue marcada como encontrada.`, id: req.params.id, estado: 'encontrado' })
  } catch (error) {
    console.error('Error marcarEncontrada:', error)
    res.status(500).json({ error: 'Error al actualizar el estado.' })
  }
}

const cerrarMascota = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, usuario_id, nombre FROM mascotas_perdidas WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ message: 'Publicación no encontrada.' })
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ message: 'Solo el dueño puede cerrar esta publicación.' })

    await pool.query("UPDATE mascotas_perdidas SET estado = 'cerrada', cerrada_en = NOW() WHERE id = ?", [req.params.id])
    res.status(200).json({ message: `La publicación de ${rows[0].nombre} fue cerrada.`, id: req.params.id, estado: 'cerrada' })
  } catch (error) {
    console.error('Error cerrarMascota:', error)
    res.status(500).json({ error: 'Error al cerrar la publicación.' })
  }
}

module.exports = { getMascotas, crearMascota, marcarEncontrada, cerrarMascota }
