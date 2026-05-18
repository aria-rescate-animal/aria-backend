const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const { upload } = require('../config/cloudinary');
const {
  getReportes,
  getMisReportes,
  getReporte,
  crearReporte,
  reportarInvalido,
  actualizarEstado,
  eliminarReporte
} = require('../controllers/reportes.controller');

router.get('/', verificarToken, getReportes);
router.get('/mis-reportes', verificarToken, getMisReportes);
router.get('/:id', verificarToken, getReporte);
router.post('/', verificarToken, upload.single('foto'), crearReporte);
router.post('/:id/reportar', verificarToken, reportarInvalido);
router.patch('/:id/estado', verificarToken, actualizarEstado);
router.delete('/:id', verificarToken, eliminarReporte);

module.exports = router;
