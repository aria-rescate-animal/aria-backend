const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const urlABase64 = async (url) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const base64   = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type']?.split(';')[0] || 'image/jpeg';
  return { base64, mimeType };
};

router.post('/', async (req, res) => {
  try {
    const { fotoUrl } = req.body;

    if (!fotoUrl) {
      return res.status(400).json({ error: 'Se requiere fotoUrl en el body' });
    }

    const { base64, mimeType } = await urlABase64(fotoUrl);

    const prompt = `Analiza esta imagen y responde ÚNICAMENTE en formato JSON con esta estructura exacta, sin texto adicional:
{
  "esAnimalReal": true o false,
  "especie": "nombre del animal en español o null",
  "confianza": número del 0 al 100,
  "motivo_rechazo": "razón si no es válida o null si es válida",
  "descripcion": "descripción breve en español"
}

Reglas ESTRICTAS — lee con atención:

1. esAnimalReal = true SOLO si la imagen es una FOTOGRAFÍA REAL de un animal vivo.
   Ejemplos válidos: foto de un perro real, foto de un gato callejero, foto de un ave herida.

2. esAnimalReal = false en TODOS estos casos:
   - Dibujos animados, caricaturas, anime o ilustraciones (aunque representen animales)
   - Figuras de juguete, peluches o esculturas de animales
   - Logos, íconos o imágenes vectoriales de animales
   - Imágenes generadas por computadora (CGI) o inteligencia artificial
   - Capturas de pantalla de videojuegos con animales
   - Imágenes de personas, paisajes, objetos, comida u otras cosas sin animales reales
   - Imágenes muy borrosas o de muy baja calidad donde no se puede confirmar que es un animal real

3. motivo_rechazo: si esAnimalReal es false, describe brevemente POR QUÉ en español.
   Ejemplos: "Es un dibujo animado, no una fotografía real", "Es un peluche, no un animal vivo", "No hay animales en la imagen"

4. Responde SOLO el JSON, sin markdown ni texto adicional.`;

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

    const texto      = response.data.candidates[0].content.parts[0].text.trim();
    const jsonLimpio = texto.replace(/```json|```/g, '').trim();
    const datos      = JSON.parse(jsonLimpio);

    const esValido = datos.esAnimalReal === true;

    res.status(200).json({
      esAnimal:         esValido,
      especieDetectada: esValido ? (datos.especie || null) : null,
      confianza:        datos.confianza || 0,
      descripcion:      datos.descripcion || '',
      motivo_rechazo:   esValido ? null : (datos.motivo_rechazo || 'La imagen no corresponde a un animal real'),
      mensaje: esValido
        ? `Animal real detectado: ${datos.especie} (${datos.confianza}% de confianza)`
        : (datos.motivo_rechazo || 'La imagen no corresponde a un animal real fotografiado')
    });

  } catch (error) {
    console.error('Error IA Service:', error.response?.data?.error?.message || error.message);
    res.status(500).json({
      esAnimal: null,
      error:    true,
      mensaje:  'No se pudo analizar la imagen con IA'
    });
  }
});

module.exports = router;
