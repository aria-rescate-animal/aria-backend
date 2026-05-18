const express = require('express');
const router  = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const { upload }     = require('../config/cloudinary');
const { getMascotas, crearMascota, marcarEncontrada } = require('../controllers/mascotas.controller');

// GET /api/mascotas-perdidas — público con filtros opcionales
router.get('/', verificarToken, getMascotas);

// POST /api/mascotas-perdidas — solo ciudadanos
router.post('/', verificarToken, upload.single('foto'), crearMascota);

// PATCH /api/mascotas-perdidas/:id/encontrada — solo el dueño
router.patch('/:id/encontrada', verificarToken, marcarEncontrada);

module.exports = router;
