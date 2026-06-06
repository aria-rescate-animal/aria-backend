const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const DB_CONNECT_RETRIES = Number(process.env.DB_CONNECT_RETRIES || 10);
const DB_CONNECT_RETRY_DELAY_MS = Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 3000);

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function verificarConexionDB() {
  for (let intento = 1; intento <= DB_CONNECT_RETRIES; intento += 1) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      console.log('Conexion a MySQL exitosa');
      return;
    } catch (err) {
      if (intento === DB_CONNECT_RETRIES) {
        console.error(`No se pudo conectar con MySQL despues de ${DB_CONNECT_RETRIES} intentos: ${err.message}`);
        return;
      }

      console.warn(`MySQL aun no esta disponible. Reintento ${intento}/${DB_CONNECT_RETRIES} en ${DB_CONNECT_RETRY_DELAY_MS / 1000}s...`);
      await esperar(DB_CONNECT_RETRY_DELAY_MS);
    }
  }
}

verificarConexionDB();

module.exports = pool;
