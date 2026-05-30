const jwt = require('jsonwebtoken');

// Middleware estricto — requiere token válido
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Acceso denegado. Token requerido.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'ARIA_SECRET_KEY_2026');
    next();
  } catch {
    return res.status(403).json({ message: 'Token inválido o expirado.' });
  }
};

// Middleware opcional — continúa sin token
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) { req.user = null; return next(); }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'ARIA_SECRET_KEY_2026');
  } catch {
    req.user = null;
  }
  next();
};

module.exports = verificarToken;
module.exports.optionalAuth = optionalAuth;
