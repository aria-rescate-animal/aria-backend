// ============================================================
// ARIA — Microservicio de IA
// Puerto: 4000
// Responsabilidad: Validar imágenes con Google Gemini
// El backend principal (3000) llama a este servicio
// ============================================================

const express = require('express');
const cors    = require('cors');
require('dotenv').config({ path: '../.env' });

const validarRoutes = require('./src/validar');

const app = express();

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/validar', validarRoutes);

app.get('/', (req, res) => res.json({
  servicio: 'ARIA IA Service',
  version: '1.0.0',
  estado: 'activo',
  modelo: 'Google Gemini 2.5 Flash'
}));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ARIA IA Service corriendo en puerto ${PORT}`);
  console.log(`Modelo: Google Gemini 2.5 Flash`);
  console.log(`Endpoint: POST http://localhost:${PORT}/validar`);
});
