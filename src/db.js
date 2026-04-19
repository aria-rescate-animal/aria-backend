const mysql = require('mysql2/promise');
require('dotenv').config();

//  Gestionar el mysql.createPool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Implementar validación de conexión con console.log
pool.getConnection()
  .then(conn => {
    console.log("✅ Conexión a MySQL exitosa - Infraestructura de persistencia lista");
    conn.release();
  })
  .catch(err => {
    console.error("❌ Error al conectar con la base de datos:", err.message);
  });

module.exports = pool;