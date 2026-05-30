const express = require('express')
const router = express.Router()
const { upload } = require('../config/cloudinary')
const { validarAnimal } = require('../config/ia')
const verificarToken = require('../middlewares/auth.middleware')

// POST /api/validar-animal
// La IA es obligatoria. Si falla, el usuario debe reintentar.
router.post('/', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen.' })
    }

    const resultado = await validarAnimal(req.file.path)

    if (resultado.error) {
      return res.status(503).json({
        esAnimal: null,
        mensaje: 'No se pudo validar la imagen en este momento. Inténtalo nuevamente.',
      })
    }

    if (!resultado.esAnimal) {
      return res.status(400).json({
        esAnimal: false,
        mensaje: 'La imagen no parece corresponder a un animal real fotografiado.',
      })
    }

    return res.status(200).json({
      esAnimal: true,
      especieDetectada: resultado.especieDetectada,
      confianza: resultado.confianza,
      mensaje: resultado.mensaje || 'Imagen validada correctamente.',
    })
  } catch (error) {
    console.error('Error validar-animal:', error)
    return res.status(500).json({ error: 'Error al analizar la imagen.' })
  }
})

module.exports = router
