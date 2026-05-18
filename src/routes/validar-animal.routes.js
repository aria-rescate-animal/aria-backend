const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudinary');
const { validarAnimal } = require('../config/ia');
const verificarToken = require('../middlewares/auth.middleware');

// POST /api/validar-animal
// Recibe imagen con campo "foto", llama a Google Vision y responde en español
router.post('/', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    const resultado = await validarAnimal(req.file.path);

    if (resultado.error) {
      return res.status(200).json({
        esAnimal: null,
        mensaje: 'No se pudo analizar la imagen. Puedes continuar de todas formas.',
        advertencia: true
      });
    }

    if (!resultado.esAnimal) {
      return res.status(400).json({
        esAnimal: false,
        mensaje: 'La imagen no corresponde a un animal. Por favor sube una foto correcta.'
      });
    }

    res.status(200).json({
      esAnimal: true,
      especieDetectada: resultado.especieDetectada,
      confianza: resultado.confianza,
      mensaje: resultado.mensaje
    });

  } catch (error) {
    console.error('Error validar-animal:', error);
    res.status(500).json({ error: 'Error al analizar la imagen' });
  }
});

module.exports = router;
