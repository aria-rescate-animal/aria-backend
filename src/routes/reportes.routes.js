const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const {
  getReportes,
  getReporte,
  crearReporte,
  actualizarEstado,
  eliminarReporte
} = require('../controllers/reportes.controller');

// GET /api/reportes - listar reportes (requiere token)
router.get('/', verificarToken, getReportes);

// GET /api/reportes/:id - obtener un reporte (requiere token)
router.get('/:id', verificarToken, getReporte);

// POST /api/reportes - crear reporte (requiere token)
router.post('/', verificarToken, crearReporte);

// PATCH /api/reportes/:id/estado - cambiar estado (requiere token)
router.patch('/:id/estado', verificarToken, actualizarEstado);

// DELETE /api/reportes/:id - eliminar reporte (requiere token)
router.delete('/:id', verificarToken, eliminarReporte);

module.exports = router;
