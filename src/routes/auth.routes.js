const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const pool     = require('../db');
const { enviarOTP, enviarOTPRecuperacion } = require('../config/email');
const passport = require('../config/passport');
const verificarToken = require('../middlewares/auth.middleware');

const JWT_SECRET   = process.env.JWT_SECRET   || 'ARIA_SECRET_KEY_2026';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const generarOTP   = () => String(Math.floor(100000 + Math.random() * 900000));
const generarToken = (user) => jwt.sign(
  { id: user.id, email: user.email, rol: user.rol },
  JWT_SECRET,
  { expiresIn: '24h' }
);

// REGISTRO
router.post('/register', async (req, res) => {
  try {
    const {
      nombre, email, contrasena, rol,
      nit, nombre_organizacion, tipo_entidad,
      telefono_oficial, direccion_sede, enlace_verificacion
    } = req.body;

    const rolFinal = ['ciudadano', 'entidad'].includes(rol) ? rol : 'ciudadano';

    if (rolFinal === 'entidad' && (!nit || !nombre_organizacion || !tipo_entidad || !telefono_oficial)) {
      return res.status(400).json({ error: 'Completa todos los campos requeridos para entidades' });
    }

    const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length > 0) return res.status(400).json({ error: 'Este correo ya esta registrado' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);
    const aprobacion_pendiente = rolFinal === 'entidad' ? 1 : 0;

    const [result] = await pool.query(
      `INSERT INTO usuarios 
       (nombre, email, password, rol, aprobacion_pendiente, email_verificado,
        nit, nombre_organizacion, tipo_entidad, telefono_oficial, direccion_sede, enlace_verificacion) 
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [nombre, email, hash, rolFinal, aprobacion_pendiente,
       nit || null, nombre_organizacion || null, tipo_entidad || null,
       telefono_oficial || null, direccion_sede || null, enlace_verificacion || null]
    );
    const nuevoUsuarioId = result.insertId;

    const codigo = generarOTP();
    const expira = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'INSERT INTO verificaciones_otp (email, codigo, expira_en) VALUES (?, ?, ?)',
      [email, codigo, expira]
    );

    try {
      await enviarOTP(email, codigo, nombre);
    } catch (emailErr) {
      console.error('Error al enviar OTP:', emailErr.message);
      await pool.query('DELETE FROM verificaciones_otp WHERE email = ?', [email]);
      await pool.query('DELETE FROM usuarios WHERE id = ?', [nuevoUsuarioId]);
      return res.status(500).json({ error: 'No se pudo enviar el codigo. Por favor, intenta registrarte de nuevo.' });
    }

    res.status(201).json({
      mensaje: 'Cuenta creada. Revisa tu correo e ingresa el codigo de 6 digitos.',
      requiereVerificacion: true,
      email,
      pendiente: rolFinal === 'entidad'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// VERIFICAR CUENTA CON OTP
router.post('/verificar-cuenta', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    if (!email || !codigo) return res.status(400).json({ error: 'Email y codigo son requeridos' });

    const [otps] = await pool.query(
      `SELECT * FROM verificaciones_otp 
       WHERE email = ? AND codigo = ? AND usado = 0 
       ORDER BY created_at DESC LIMIT 1`,
      [email, codigo]
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: 'Codigo invalido. Verifica que lo ingresaste correctamente.' });
    }

    const otp = otps[0];
    if (new Date() > new Date(otp.expira_en)) {
      return res.status(400).json({ error: 'El codigo ha expirado. Solicita uno nuevo.' });
    }

    await pool.query('UPDATE verificaciones_otp SET usado = 1 WHERE id = ?', [otp.id]);
    await pool.query('UPDATE usuarios SET email_verificado = 1 WHERE email = ?', [email]);

    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    const user   = rows[0];

    if (user.rol === 'entidad' && user.aprobacion_pendiente === 1) {
      return res.json({
        verificado: true,
        pendienteAprobacion: true,
        mensaje: 'Correo verificado. Tu cuenta sera revisada por un administrador.'
      });
    }

    const token = generarToken(user);
    res.json({
      verificado: true,
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al verificar codigo' });
  }
});

// Alias de compatibilidad
router.post('/verificar-otp', async (req, res) => {
  req.url = '/verificar-cuenta';
  return router.handle(req, res, () => {});
});

// REENVIAR OTP
router.post('/reenviar-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const [users] = await pool.query('SELECT nombre FROM usuarios WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'Email no encontrado' });

    await pool.query(
      'UPDATE verificaciones_otp SET usado = 1 WHERE email = ? AND usado = 0',
      [email]
    );

    const codigo = generarOTP();
    const expira = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'INSERT INTO verificaciones_otp (email, codigo, expira_en) VALUES (?, ?, ?)',
      [email, codigo, expira]
    );

    await enviarOTP(email, codigo, users[0].nombre);
    res.json({ mensaje: 'Nuevo codigo enviado a tu correo' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al reenviar codigo' });
  }
});

// LOGIN — incluye validacion de cuenta bloqueada
router.post('/login', async (req, res) => {
  try {
    const { email, contrasena } = req.body;
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = rows[0];

    if (!user.email_verificado) {
      return res.status(403).json({
        error: 'Debes verificar tu correo antes de iniciar sesion.',
        requiereVerificacion: true,
        email
      });
    }

    // Cuenta bloqueada por administrador
    if (user.bloqueado === 1) {
      return res.status(403).json({
        error: 'Tu cuenta ha sido suspendida. Contacta al administrador.'
      });
    }

    if (user.rol === 'entidad' && user.aprobacion_pendiente === 1) {
      return res.status(403).json({ error: 'Tu cuenta esta pendiente de aprobacion por un administrador.' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Esta cuenta usa inicio de sesion con Google.' });
    }

    const passValido = await bcrypt.compare(contrasena, user.password);
    if (!passValido) return res.status(401).json({ error: 'Contrasena incorrecta' });

    const token = generarToken(user);
    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/auth/perfil — Actualizar nombre del usuario autenticado
router.patch('/perfil', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre no puede estar vacio' });
    }
    if (nombre.trim().length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
    }

    await pool.query(
      'UPDATE usuarios SET nombre = ? WHERE id = ?',
      [nombre.trim(), req.user.id]
    );

    const [rows] = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ?',
      [req.user.id]
    );

    res.json({
      mensaje: 'Perfil actualizado correctamente',
      user: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// RECUPERAR PASSWORD
router.post('/recuperar-password', async (req, res) => {
  try {
    const { email } = req.body;
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.json({ mensaje: 'Si el correo esta registrado, recibiras un codigo.' });
    }

    const user   = rows[0];
    const codigo = generarOTP();
    const expira = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE tokens_recuperacion SET usado = 1 WHERE usuario_id = ? AND usado = 0',
      [user.id]
    );

    await pool.query(
      'INSERT INTO tokens_recuperacion (usuario_id, token, expira_en) VALUES (?, ?, ?)',
      [user.id, codigo, expira]
    );

    try {
      await enviarOTPRecuperacion(email, user.nombre, codigo);
    } catch (emailErr) {
      console.error('Error al enviar OTP recuperacion:', emailErr.message);
    }

    res.json({ mensaje: 'Si el correo esta registrado, recibiras un codigo.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar solicitud' });
  }
});

// VALIDAR OTP RECUPERACION
router.post('/validar-otp-recuperacion', async (req, res) => {
  try {
    const { email, codigo } = req.body;

    const [rows] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(404).json({ error: 'Email no encontrado' });

    const [tokens] = await pool.query(
      `SELECT * FROM tokens_recuperacion 
       WHERE usuario_id = ? AND token = ? AND usado = 0 
       ORDER BY created_at DESC LIMIT 1`,
      [rows[0].id, codigo]
    );

    if (tokens.length === 0) return res.status(400).json({ error: 'Codigo invalido' });

    if (new Date() > new Date(tokens[0].expira_en)) {
      return res.status(400).json({ error: 'El codigo ha expirado. Solicita uno nuevo.' });
    }

    const tempToken = crypto.randomBytes(16).toString('hex');
    await pool.query(
      'UPDATE tokens_recuperacion SET token = ? WHERE id = ?',
      [`VALIDATED_${tempToken}`, tokens[0].id]
    );

    res.json({ valido: true, resetToken: `VALIDATED_${tempToken}` });
  } catch (error) {
    res.status(500).json({ error: 'Error al validar codigo' });
  }
});

// RESET PASSWORD
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, contrasena } = req.body;
    if (!resetToken || !contrasena) return res.status(400).json({ error: 'Datos incompletos' });
    if (contrasena.length < 8) return res.status(400).json({ error: 'Minimo 8 caracteres' });

    const [tokens] = await pool.query(
      'SELECT * FROM tokens_recuperacion WHERE token = ? AND usado = 0',
      [resetToken]
    );

    if (tokens.length === 0) return res.status(400).json({ error: 'Token invalido o expirado' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    await pool.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, tokens[0].usuario_id]);
    await pool.query('UPDATE tokens_recuperacion SET usado = 1 WHERE id = ?', [tokens[0].id]);

    res.json({ mensaje: 'Contrasena actualizada. Ya puedes iniciar sesion.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar contrasena' });
  }
});

// GOOGLE OAUTH
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login?error=google`, session: false }),
  (req, res) => {
    try {
      const user     = req.user;
      const token    = generarToken(user);
      const userData = encodeURIComponent(JSON.stringify({
        id: user.id, nombre: user.nombre, email: user.email, rol: user.rol
      }));
      res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}&user=${userData}`);
    } catch {
      res.redirect(`${FRONTEND_URL}/login?error=google`);
    }
  }
);

module.exports = router;
