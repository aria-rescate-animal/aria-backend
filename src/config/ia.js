// ============================================================
// ARIA Backend — Cliente del microservicio de IA
// Llama al ia-service en puerto 4000
// Si el servicio no está disponible, el reporte se guarda igual
// ============================================================

const axios = require('axios');

const IA_SERVICE_URL = process.env.IA_SERVICE_URL || 'http://localhost:4000';

const validarAnimal = async (fotoUrl) => {
  try {
    const response = await axios.post(`${IA_SERVICE_URL}/validar`, { fotoUrl }, {
      timeout: 30000 // 30 segundos máximo
    });

    return {
      esAnimal:         response.data.esAnimal,
      especieDetectada: response.data.especieDetectada,
      confianza:        response.data.confianza,
      descripcion:      response.data.descripcion,
      error:            false,
      mensaje:          response.data.mensaje
    };

  } catch (error) {
    console.error('Error llamando al IA Service:', error.message);
    // Si el microservicio falla, no bloqueamos el flujo principal
    return {
      esAnimal:         null,
      especieDetectada: null,
      confianza:        0,
      error:            true,
      mensaje:          'No se pudo analizar la imagen con IA'
    };
  }
};

module.exports = { validarAnimal };
