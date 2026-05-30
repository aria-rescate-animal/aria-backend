const express = require('express');
const cors    = require('cors');
const session = require('express-session');
require('dotenv').config();

const passport             = require('./src/config/passport');
const authRoutes           = require('./src/routes/auth.routes');
const reportesRoutes       = require('./src/routes/reportes.routes');
const notificacionesRoutes = require('./src/routes/notificaciones.routes');
const adminRoutes          = require('./src/routes/admin.routes');
const validarAnimalRoutes  = require('./src/routes/validar-animal.routes');
const mascotasRoutes       = require('./src/routes/mascotas.routes');

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'aria_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

// Rutas
app.use('/api/auth',              authRoutes);
app.use('/api/reportes',          reportesRoutes);
app.use('/api/notificaciones',    notificacionesRoutes);
app.use('/api/admin',             adminRoutes);
app.use('/api/validar-animal',    validarAnimalRoutes);
app.use('/api/mascotas-perdidas', mascotasRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'aria-backend' }));
app.get('/', (req, res) => res.json({ message: 'ARIA Backend v3.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
  console.log(`Auth: OTP + Google OAuth + Recuperacion de password`);
  console.log(`IA: Google Gemini activo`);
});
