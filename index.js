const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const pool = require('./src/db');
const reportesRoutes = require('./src/routes/reportes.routes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // limit para fotos en base64

// Endpoint de Registro
app.post('/api/register', async (req, res) => {
  try {
    const { nombre, email, contrasena } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    await pool.query(
      "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)",
      [nombre, email, hash, 'rescatista']
    );

    res.status(201).json({ mensaje: "Usuario registrado con éxito" });
  } catch (error) {
    res.status(400).json({ error: "Email ya registrado o error en servidor" });
  }
});

// Endpoint de Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, contrasena } = req.body;
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);

    if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

    const user = rows[0];
    const passValido = await bcrypt.compare(contrasena, user.password);

    if (!passValido) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      process.env.JWT_SECRET || 'ARIA_SECRET_KEY_2026',
      { expiresIn: '24h' }
    );

    res.json({
      mensaje: "Bienvenido",
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (error) {
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Rutas de reportes
app.use('/api/reportes', reportesRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: '🐾 ARIA Backend funcionando correctamente' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`   Servidor corriendo en el puerto ${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   POST /api/register`);
  console.log(`   POST /api/login`);
  console.log(`   GET  /api/reportes`);
  console.log(`   POST /api/reportes`);
  console.log(`   PATCH /api/reportes/:id/estado`);
});
