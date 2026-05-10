const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/auth.middleware');
const {
  getNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas
} = require('../controllers/notificaciones.controller');

router.get('/', verificarToken, getNotificaciones);
router.get('/no-leidas', verificarToken, contarNoLeidas);
router.patch('/leer-todas', verificarToken, marcarTodasLeidas);
router.patch('/:id/leer', verificarToken, marcarLeida);

module.exports = router;
