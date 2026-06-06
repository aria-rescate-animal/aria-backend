const express  = require('express')
const router   = express.Router()
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const crypto   = require('crypto')
const pool     = require('../db')
const { enviarOTP, enviarOTPRecuperacion } = require('../config/email')
const passport = require('../config/passport')
const verificarToken = require('../middlewares/auth.middleware')
const {
  TIPOS_ENTIDAD,
  SERVICIOS_ENTIDAD,
  normalizarNIT,
  normalizarCategoria,
  serviciosToArray,
  serviciosCompatiblesCategoria,
  categoriaRequiereRevision,
} = require('../utils/aria.constants')

const JWT_SECRET   = process.env.JWT_SECRET   || 'ARIA_SECRET_KEY_2026'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const generarOTP = () => String(Math.floor(100000 + Math.random() * 900000))
const generarToken = (user) => jwt.sign(
  { id: user.id, email: user.email, rol: user.rol },
  JWT_SECRET,
  { expiresIn: '24h' }
)

const soloDigitos = (valor) => String(valor || '').replace(/\D/g, '')

const normalizarTelefonoColombia = (valor) => {
  return soloDigitos(valor)
}

const validarNIT = (nit) => {
  if (/[a-zA-Z]/.test(String(nit || ''))) {
    return { valido: false, error: 'El NIT no puede contener letras' }
  }
  const normalizado = normalizarNIT(nit)
  if (!normalizado) return { valido: false, error: 'El NIT es requerido' }
  if (normalizado.length < 9 || normalizado.length > 10) {
    return { valido: false, error: 'El NIT debe tener 9 dígitos, o 10 si incluye dígito de verificación' }
  }
  return { valido: true, normalizado }
}

const validarUrlOpcional = (url) => {
  const value = String(url || '').trim()
  if (!value) return true
  return /^https?:\/\/.+\..+/.test(value) && value.length <= 255
}

const userPayload = (user) => ({
  id: user.id,
  nombre: user.nombre,
  email: user.email,
  rol: user.rol,
  nombre_organizacion: user.nombre_organizacion || null,
  estado_aprobacion: user.estado_aprobacion || null,
})

const eliminarCuentaNoVerificada = async (usuario) => {
  if (!usuario || Number(usuario.email_verificado) !== 0) return false
  await pool.query('DELETE FROM verificaciones_otp WHERE email = ?', [usuario.email])
  await pool.query('DELETE FROM tokens_recuperacion WHERE usuario_id = ?', [usuario.id])
  await pool.query('DELETE FROM notificaciones WHERE usuario_id = ?', [usuario.id])
  await pool.query('DELETE FROM usuarios WHERE id = ?', [usuario.id])
  return true
}

router.post('/register', async (req, res) => {
  try {
    const {
      nombre, email, contrasena, rol,
      nit, nombre_organizacion, tipo_entidad,
      telefono_oficial, ciudad, representante,
      descripcion_entidad, servicios_ofrecidos,
      direccion_sede, enlace_verificacion,
    } = req.body

    const rolFinal = ['ciudadano', 'entidad'].includes(rol) ? rol : 'ciudadano'
    const emailFinal = String(email || '').trim().toLowerCase()

    if (!nombre || nombre.trim().length < 2)
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' })
    if (!emailFinal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFinal))
      return res.status(400).json({ error: 'El formato del correo no es válido' })
    if (!contrasena || contrasena.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

    const [usuariosMismoEmail] = await pool.query(
      'SELECT id, email, email_verificado FROM usuarios WHERE email = ?',
      [emailFinal]
    )
    if (usuariosMismoEmail.length > 0) {
      const existente = usuariosMismoEmail[0]
      if (Number(existente.email_verificado) === 0) {
        await eliminarCuentaNoVerificada(existente)
      } else {
        return res.status(400).json({ error: 'Este correo ya está registrado. Inicia sesión o recupera tu contraseña.' })
      }
    }

    let nitNormalizado = null
    let serviciosLimpios = null
    let telNormalizado = null

    if (rolFinal === 'entidad') {
      const nitValidacion = validarNIT(nit)
      if (!nitValidacion.valido) return res.status(400).json({ error: nitValidacion.error })
      nitNormalizado = nitValidacion.normalizado

      const [nitExistente] = await pool.query(
        'SELECT id, email, email_verificado FROM usuarios WHERE nit = ? AND rol = "entidad"',
        [nitNormalizado]
      )
      if (nitExistente.length > 0) {
        const entidadExistente = nitExistente[0]
        if (Number(entidadExistente.email_verificado) === 0) {
          await eliminarCuentaNoVerificada(entidadExistente)
        } else {
          return res.status(400).json({ error: 'Ya existe una entidad registrada con ese NIT' })
        }
      }

      const nombreOrg = String(nombre_organizacion || '').trim()
      telNormalizado = normalizarTelefonoColombia(telefono_oficial)
      const ciudadFinal = String(ciudad || '').trim()
      const representanteFinal = String(representante || '').trim()
      const descripcionFinal = String(descripcion_entidad || '').trim()
      const direccionFinal = String(direccion_sede || '').trim()
      const enlaceFinal = String(enlace_verificacion || '').trim()

      if (!nombreOrg || nombreOrg.length < 3 || nombreOrg.length > 100)
        return res.status(400).json({ error: 'El nombre de la organización debe tener entre 3 y 100 caracteres' })
      if (!tipo_entidad || !TIPOS_ENTIDAD.includes(tipo_entidad))
        return res.status(400).json({ error: 'Selecciona un tipo de entidad válido' })
      if (!telefono_oficial || /[a-zA-Z]/.test(String(telefono_oficial)) || telNormalizado.length !== 10)
        return res.status(400).json({ error: 'El teléfono oficial debe tener 10 dígitos y no puede contener letras' })
      if (!ciudadFinal || ciudadFinal.length < 2 || ciudadFinal.length > 100)
        return res.status(400).json({ error: 'La ciudad debe tener entre 2 y 100 caracteres' })
      if (!representanteFinal || representanteFinal.length < 3 || representanteFinal.length > 100)
        return res.status(400).json({ error: 'El representante debe tener entre 3 y 100 caracteres' })
      if (!descripcionFinal || descripcionFinal.length < 20)
        return res.status(400).json({ error: 'La descripción debe tener al menos 20 caracteres' })
      if (descripcionFinal.length > 800)
        return res.status(400).json({ error: 'La descripción debe tener máximo 800 caracteres' })
      if (direccionFinal.length > 200)
        return res.status(400).json({ error: 'La dirección de sede debe tener máximo 200 caracteres' })
      if (!validarUrlOpcional(enlaceFinal))
        return res.status(400).json({ error: 'El sitio web debe iniciar con http:// o https:// y tener máximo 255 caracteres' })

      const serviciosArray = serviciosToArray(servicios_ofrecidos).filter(s => SERVICIOS_ENTIDAD.includes(s))
      if (serviciosArray.length === 0)
        return res.status(400).json({ error: 'Selecciona al menos un servicio ofrecido válido' })
      serviciosLimpios = serviciosArray.join(',')
    }

    const hash = await bcrypt.hash(contrasena, 10)
    const aprobacion_pendiente = rolFinal === 'entidad' ? 1 : 0
    const estado_aprobacion    = rolFinal === 'entidad' ? 'pendiente' : 'aprobada'

    const [result] = await pool.query(
      `INSERT INTO usuarios
       (nombre, email, password, rol, aprobacion_pendiente, email_verificado, estado_aprobacion,
        nit, nombre_organizacion, tipo_entidad, telefono_oficial, ciudad, representante,
        descripcion_entidad, servicios_ofrecidos, direccion_sede, enlace_verificacion)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre.trim(), emailFinal, hash, rolFinal, aprobacion_pendiente, estado_aprobacion,
        nitNormalizado, String(nombre_organizacion || '').trim() || null, tipo_entidad || null,
        rolFinal === 'entidad' ? telNormalizado : null, String(ciudad || '').trim() || null, String(representante || '').trim() || null,
        String(descripcion_entidad || '').trim() || null, serviciosLimpios,
        String(direccion_sede || '').trim() || null, String(enlace_verificacion || '').trim() || null,
      ]
    )

    const codigo = generarOTP()
    const expira = new Date(Date.now() + 15 * 60 * 1000)
    await pool.query('INSERT INTO verificaciones_otp (email, codigo, expira_en) VALUES (?, ?, ?)', [emailFinal, codigo, expira])

    try {
      await enviarOTP(emailFinal, codigo, nombre.trim())
    } catch (emailErr) {
      console.error('Error al enviar OTP:', emailErr.message)
      await pool.query('DELETE FROM verificaciones_otp WHERE email = ?', [emailFinal])
      await pool.query('DELETE FROM usuarios WHERE id = ?', [result.insertId])
      return res.status(500).json({ error: 'No se pudo enviar el código de verificación. Intenta de nuevo.' })
    }

    res.status(201).json({
      mensaje: 'Cuenta creada. Revisa tu correo e ingresa el código de 6 dígitos.',
      requiereVerificacion: true,
      email: emailFinal,
      pendiente: rolFinal === 'entidad',
    })
  } catch (error) {
    console.error('register:', error)
    res.status(500).json({ error: 'Error al registrar usuario' })
  }
})

const verificarCuenta = async (req, res) => {
  try {
    const { email, codigo } = req.body
    if (!email || !codigo) return res.status(400).json({ error: 'Email y código son requeridos' })

    const [otps] = await pool.query(
      'SELECT * FROM verificaciones_otp WHERE email = ? AND codigo = ? AND usado = 0 ORDER BY created_at DESC LIMIT 1',
      [email.trim().toLowerCase(), codigo]
    )
    if (otps.length === 0) return res.status(400).json({ error: 'Código inválido. Verifica que lo ingresaste correctamente.' })
    if (new Date() > new Date(otps[0].expira_en)) return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' })

    await pool.query('UPDATE verificaciones_otp SET usado = 1 WHERE id = ?', [otps[0].id])
    await pool.query('UPDATE usuarios SET email_verificado = 1 WHERE email = ?', [email.trim().toLowerCase()])

    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email.trim().toLowerCase()])
    const user = rows[0]

    if (user.rol === 'entidad' && (user.aprobacion_pendiente === 1 || user.estado_aprobacion === 'pendiente')) {
      const [admins] = await pool.query("SELECT id FROM usuarios WHERE rol = 'administrador'")
      for (const admin of admins) {
        await pool.query(
          'INSERT INTO notificaciones (usuario_id, titulo, mensaje) VALUES (?, ?, ?)',
          [
            admin.id,
            'Nueva entidad pendiente de aprobación',
            `La entidad "${user.nombre_organizacion || user.nombre}" verificó su correo y espera aprobación. Tipo: ${user.tipo_entidad || 'No registrado'}.`
          ]
        )
      }

      const token = generarToken(user)
      return res.json({
        verificado: true,
        token,
        user: userPayload(user),
        pendienteAprobacion: true,
        mensaje: 'Correo verificado. La información de tu entidad será revisada por un administrador antes de habilitarte.',
      })
    }

    const token = generarToken(user)
    res.json({ verificado: true, token, user: userPayload(user) })
  } catch (error) {
    console.error('verificar-cuenta:', error)
    res.status(500).json({ error: 'Error al verificar código' })
  }
}

router.post('/verificar-cuenta', verificarCuenta)
router.post('/verificar-otp', verificarCuenta)

router.post('/reenviar-otp', async (req, res) => {
  try {
    const { email } = req.body
    const emailFinal = String(email || '').trim().toLowerCase()
    const [users] = await pool.query('SELECT nombre, email_verificado FROM usuarios WHERE email = ?', [emailFinal])
    if (users.length === 0) return res.status(404).json({ error: 'Email no encontrado' })
    if (Number(users[0].email_verificado) === 1) return res.status(400).json({ error: 'Este correo ya fue verificado. Inicia sesión.' })

    await pool.query('UPDATE verificaciones_otp SET usado = 1 WHERE email = ? AND usado = 0', [emailFinal])

    const codigo = generarOTP()
    const expira = new Date(Date.now() + 15 * 60 * 1000)
    await pool.query('INSERT INTO verificaciones_otp (email, codigo, expira_en) VALUES (?, ?, ?)', [emailFinal, codigo, expira])
    await enviarOTP(emailFinal, codigo, users[0].nombre)

    res.json({ mensaje: 'Nuevo código enviado a tu correo' })
  } catch (error) {
    console.error('reenviar-otp:', error)
    res.status(500).json({ error: 'Error al reenviar código' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, contrasena } = req.body
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [String(email || '').trim().toLowerCase()])
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
    const user = rows[0]

    if (!user.email_verificado)
      return res.status(403).json({ error: 'Debes verificar tu correo antes de iniciar sesión.', requiereVerificacion: true, email: user.email })
    if (!user.password) return res.status(400).json({ error: 'Esta cuenta usa inicio de sesión con Google.' })
    const passValido = await bcrypt.compare(contrasena, user.password)
    if (!passValido) return res.status(401).json({ error: 'Contraseña incorrecta' })

    if (user.rol === 'entidad') {
      if (user.estado_aprobacion === 'rechazada') {
        return res.status(403).json({
          error: `Tu solicitud de entidad fue rechazada.${user.motivo_rechazo ? ` Motivo: ${user.motivo_rechazo}` : ''}`,
          estado_aprobacion: 'rechazada',
          motivo_rechazo: user.motivo_rechazo || null,
        })
      }
      if (user.estado_aprobacion === 'bloqueada' || user.bloqueado === 1) {
        return res.status(403).json({ error: 'Tu cuenta ha sido suspendida. Contacta al administrador.', estado_aprobacion: 'bloqueada' })
      }
      if (user.aprobacion_pendiente === 1 || user.estado_aprobacion === 'pendiente') {
        const token = generarToken(user)
        return res.json({
          token,
          user: userPayload(user),
          pendienteAprobacion: true,
          mensaje: 'Tu entidad está pendiente de aprobación por un administrador.',
        })
      }
    } else if (user.bloqueado === 1) {
      return res.status(403).json({ error: 'Tu cuenta ha sido suspendida. Contacta al administrador.' })
    }

    const token = generarToken(user)
    res.json({ token, user: userPayload(user) })
  } catch (error) {
    console.error('login:', error)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/entidades-disponibles', verificarToken, async (req, res) => {
  try {
    const categoria = normalizarCategoria(req.query.categoria || '')
    const serviciosCompatibles = req.query.categoria ? serviciosCompatiblesCategoria(categoria) : []

    const [rows] = await pool.query(
      `SELECT id, nombre, nombre_organizacion, tipo_entidad, servicios_ofrecidos, ciudad
       FROM usuarios
       WHERE rol = 'entidad' AND aprobacion_pendiente = 0 AND bloqueado = 0 AND estado_aprobacion = 'aprobada'
       ORDER BY nombre_organizacion ASC`
    )

    const entidades = rows.map(e => {
      const servicios = serviciosToArray(e.servicios_ofrecidos)
      const serviciosRelevantes = serviciosCompatibles.length > 0
        ? servicios.filter(s => serviciosCompatibles.includes(s))
        : servicios
      const compatible = req.query.categoria
        ? (!categoriaRequiereRevision(categoria) && serviciosRelevantes.length > 0)
        : true
      return { ...e, servicios, servicios_relevantes: serviciosRelevantes, compatible }
    })

    res.json({
      todas: entidades,
      sugeridas: req.query.categoria ? entidades.filter(e => e.compatible) : entidades,
      categoria,
      serviciosCompatibles,
      requiereRevision: categoriaRequiereRevision(categoria),
    })
  } catch (error) {
    console.error('entidades-disponibles:', error)
    res.status(500).json({ error: 'Error al obtener entidades' })
  }
})

router.patch('/perfil', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body
    if (!nombre || nombre.trim().length < 2) return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' })
    await pool.query('UPDATE usuarios SET nombre = ? WHERE id = ?', [nombre.trim(), req.user.id])
    const [rows] = await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?', [req.user.id])
    res.json({ mensaje: 'Perfil actualizado correctamente', user: rows[0] })
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar perfil' })
  }
})

router.post('/recuperar-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email])
    if (rows.length === 0) return res.json({ mensaje: 'Si el correo está registrado, recibirás un código.' })

    const user   = rows[0]
    const codigo = generarOTP()
    const expira = new Date(Date.now() + 15 * 60 * 1000)

    await pool.query('UPDATE tokens_recuperacion SET usado = 1 WHERE usuario_id = ? AND usado = 0', [user.id])
    await pool.query('INSERT INTO tokens_recuperacion (usuario_id, token, expira_en) VALUES (?, ?, ?)', [user.id, codigo, expira])

    try { await enviarOTPRecuperacion(email, user.nombre, codigo) } catch (e) { console.error(e.message) }
    res.json({ mensaje: 'Si el correo está registrado, recibirás un código.' })
  } catch (error) {
    console.error('recuperar-password:', error)
    res.status(500).json({ error: 'Error al procesar solicitud' })
  }
})

router.post('/validar-otp-recuperacion', async (req, res) => {
  try {
    const { email, codigo } = req.body
    const [rows] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [String(email || '').trim().toLowerCase()])
    if (rows.length === 0) return res.status(404).json({ error: 'Email no encontrado' })

    const [tokens] = await pool.query(
      'SELECT * FROM tokens_recuperacion WHERE usuario_id = ? AND token = ? AND usado = 0 ORDER BY created_at DESC LIMIT 1',
      [rows[0].id, codigo]
    )
    if (tokens.length === 0) return res.status(400).json({ error: 'Código inválido' })
    if (new Date() > new Date(tokens[0].expira_en)) return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' })

    const tempToken = crypto.randomBytes(16).toString('hex')
    await pool.query('UPDATE tokens_recuperacion SET token = ? WHERE id = ?', [`VALIDATED_${tempToken}`, tokens[0].id])
    res.json({ valido: true, resetToken: `VALIDATED_${tempToken}` })
  } catch (error) {
    console.error('validar-otp-recuperacion:', error)
    res.status(500).json({ error: 'Error al validar código' })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const resetToken = req.body.resetToken || req.body.token
    const { contrasena } = req.body
    if (!resetToken || !contrasena) return res.status(400).json({ error: 'Datos incompletos' })
    if (contrasena.length < 8) return res.status(400).json({ error: 'Mínimo 8 caracteres' })

    const [tokens] = await pool.query('SELECT * FROM tokens_recuperacion WHERE token = ? AND usado = 0', [resetToken])
    if (tokens.length === 0) return res.status(400).json({ error: 'Token inválido o expirado' })

    const hash = await bcrypt.hash(contrasena, 10)
    await pool.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, tokens[0].usuario_id])
    await pool.query('UPDATE tokens_recuperacion SET usado = 1 WHERE id = ?', [tokens[0].id])

    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' })
  } catch (error) {
    console.error('reset-password:', error)
    res.status(500).json({ error: 'Error al actualizar contraseña' })
  }
})

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login?error=google`, session: false }),
  (req, res) => {
    try {
      const user     = req.user
      const token    = generarToken(user)
      const userData = encodeURIComponent(JSON.stringify(userPayload(user)))
      const pendiente = user.rol === 'entidad' && (user.aprobacion_pendiente === 1 || user.estado_aprobacion === 'pendiente')
      const extra = pendiente ? '&pendienteAprobacion=1' : ''
      res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}&user=${userData}${extra}`)
    } catch (error) {
      console.error('google-callback:', error)
      res.redirect(`${FRONTEND_URL}/login?error=google`)
    }
  }
)

module.exports = router
