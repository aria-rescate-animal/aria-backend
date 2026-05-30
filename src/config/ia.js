// ─── Cliente del microservicio de IA (puerto 4000) ────────────────
// REGLA: si la IA falla o rechaza, el reporte NO se guarda
const axios = require('axios')

const IA_SERVICE_URL = process.env.IA_SERVICE_URL || 'http://localhost:4000'

const validarAnimal = async (fotoUrl) => {
  try {
    const response = await axios.post(`${IA_SERVICE_URL}/validar`, { fotoUrl }, {
      timeout: 30000
    })
    return {
      esAnimal:         response.data.esAnimal,
      especieDetectada: response.data.especieDetectada,
      confianza:        response.data.confianza,
      descripcion:      response.data.descripcion,
      motivo_rechazo:   response.data.motivo_rechazo || null,
      error:            false,
      mensaje:          response.data.mensaje
    }
  } catch (error) {
    console.error('Error llamando al IA Service:', error.message)
    return {
      esAnimal:         null,
      especieDetectada: null,
      confianza:        0,
      error:            true,
      mensaje:          'No se pudo validar la imagen en este momento. Inténtalo nuevamente.'
    }
  }
}

module.exports = { validarAnimal }
