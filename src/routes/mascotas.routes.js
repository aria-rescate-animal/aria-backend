const express = require('express')
const router = express.Router()
const verificarToken = require('../middlewares/auth.middleware')
const { optionalAuth } = require('../middlewares/auth.middleware')
const { upload } = require('../config/cloudinary')
const { getMascotas, crearMascota, marcarEncontrada, cerrarMascota } = require('../controllers/mascotas.controller')

router.get('/', optionalAuth, getMascotas)
router.post('/', verificarToken, upload.single('foto'), crearMascota)
router.patch('/:id/encontrada', verificarToken, marcarEncontrada)
router.patch('/:id/cerrar', verificarToken, cerrarMascota)

module.exports = router
