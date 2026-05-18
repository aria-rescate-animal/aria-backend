// ============================================================
// ARIA IA Service — Endpoint de validación
// POST /validar — recibe URL de imagen, llama a Gemini
// ============================================================

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const urlABase64 = async (url) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const base64   = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type']?.split(';')[0] || 'image/jpeg';
  return { base64, mimeType };
};

// POST /validar
// Body: { fotoUrl: "https://..." }
// Respuesta: { esAnimal, especieDetectada, confianza, mensaje }
router.post('/', async (req, res) => {
  try {
    const { fotoUrl } = req.body;

    if (!fotoUrl) {
      return res.status(400).json({ error: 'Se requiere fotoUrl en el body' });
    }

    const { base64, mimeType } = await urlABase64(fotoUrl);

    const prompt = `Analiza esta imagen y responde ÚNICAMENTE en formato JSON con esta estructura exacta, sin texto adicional:
{
  "esAnimal": true o false,
  "especie": "nombre del animal en español o null si no es animal",
  "confianza": número del 0 al 100,
  "descripcion": "descripción breve en español de lo que ves"
}

Reglas:
- esAnimal true si hay cualquier animal (perro, gato, caballo, vaca, ave, reptil, etc)
- esAnimal false si no hay ningún animal en la imagen
- Responde SOLO el JSON sin markdown ni explicaciones`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt }
          ]
        }]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const texto     = response.data.candidates[0].content.parts[0].text.trim();
    const jsonLimpio = texto.replace(/```json|```/g, '').trim();
    const datos     = JSON.parse(jsonLimpio);

    res.status(200).json({
      esAnimal:         datos.esAnimal === true,
      especieDetectada: datos.especie  || null,
      confianza:        datos.confianza || 0,
      descripcion:      datos.descripcion || '',
      mensaje: datos.esAnimal
        ? `Animal detectado: ${datos.especie} (${datos.confianza}% de confianza)`
        : 'No se detectó ningún animal en la imagen'
    });

  } catch (error) {
    console.error('Error IA Service:', error.response?.data?.error?.message || error.message);
    res.status(500).json({
      esAnimal: null,
      error: true,
      mensaje: 'No se pudo analizar la imagen con IA'
    });
  }
});

module.exports = router;
