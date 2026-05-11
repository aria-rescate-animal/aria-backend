const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const { upload } = require('../config/cloudinary');
const {
  getReportes,
  getMisReportes,
  getReporte,
  crearReporte,
  actualizarEstado,
  eliminarReporte
} = require('../controllers/reportes.controller');

router.get('/', verificarToken, getReportes);

// IMPORTANTE: /mis-reportes DEBE ir antes de /:id
// Si va después, Express interpreta "mis-reportes" como un :id
router.get('/mis-reportes', verificarToken, getMisReportes);

router.get('/:id', verificarToken, getReporte);
router.post('/', verificarToken, upload.single('foto'), crearReporte);
router.patch('/:id/estado', verificarToken, actualizarEstado);
router.delete('/:id', verificarToken, eliminarReporte);

module.exports = router;
