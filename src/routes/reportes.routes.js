const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const { upload } = require('../config/cloudinary');
const {
  getReportes,
  getReporte,
  crearReporte,
  actualizarEstado,
  eliminarReporte
} = require('../controllers/reportes.controller');

router.get('/', verificarToken, getReportes);
router.get('/:id', verificarToken, getReporte);
// upload.single('foto') procesa el archivo antes de llegar al controlador
router.post('/', verificarToken, upload.single('foto'), crearReporte);
router.patch('/:id/estado', verificarToken, actualizarEstado);
router.delete('/:id', verificarToken, eliminarReporte);

module.exports = router;
