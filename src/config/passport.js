const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('../db');

// ── Diagnóstico seguro: confirma carga sin imprimir secretos ──
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('Google OAuth no está configurado: faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET');
}
console.log('Google OAuth Client ID cargado:', process.env.GOOGLE_CLIENT_ID ? 'sí' : 'no');
console.log('Google OAuth Client Secret cargado:', process.env.GOOGLE_CLIENT_SECRET ? 'sí' : 'no');
console.log('Google OAuth Callback URL:', process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email  = profile.emails[0].value;
    const nombre = profile.displayName;
    const googleId = profile.id;

    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ? OR google_id = ?', [email, googleId]);

    if (rows.length > 0) {
      const user = rows[0];
      if (!user.google_id) {
        await pool.query('UPDATE usuarios SET google_id = ?, email_verificado = 1 WHERE id = ?', [googleId, user.id]);
      }
      return done(null, user);
    }

    const [result] = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol, email_verificado, google_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, email, '', 'ciudadano', 1, googleId]
    );

    const [newUser] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [result.insertId]);
    return done(null, newUser[0]);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [id]);
  done(null, rows[0] || null);
});

module.exports = passport;
