/**
 * ARIA — Script para crear administrador desde consola
 * Uso: node scripts/crear-admin.js
 * Opciones:
 *   node scripts/crear-admin.js --nombre="Mi Admin" --email="admin@correo.com" --password="MiClave123"
 *   node scripts/crear-admin.js --email="admin@aria.com" --force  (resetear contraseña)
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    })
);

const nombre   = args.nombre   || 'Administrador ARIA';
const email    = args.email    || 'admin@aria.com';
const password = args.password || 'Admin2026!';

async function main() {
  console.log('\n  ARIA — Crear Administrador\n');

  const pool = await mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'aria_db',
  });

  try {
    const [existe] = await pool.query(
      'SELECT id, rol FROM usuarios WHERE email = ?', [email]
    );

    if (existe.length > 0) {
      if (existe[0].rol === 'administrador') {
        if (!args.force) {
          console.log(`  Ya existe un admin con ese email: ${email}`);
          console.log('  Para resetear su contrasena usa --force\n');
          await pool.end();
          process.exit(0);
        }
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
          'UPDATE usuarios SET password = ?, nombre = ? WHERE email = ?',
          [hash, nombre, email]
        );
        console.log(`  Contrasena del admin actualizada correctamente\n`);
        console.log(`  Email:      ${email}`);
        console.log(`  Contrasena: ${password}\n`);
        await pool.end();
        return;
      } else {
        console.log(`  Ese email ya existe como "${existe[0].rol}"`);
        console.log('  Usa otro email: --email=otro@correo.com\n');
        await pool.end();
        process.exit(1);
      }
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO usuarios
       (nombre, email, password, rol, email_verificado, aprobacion_pendiente, bloqueado)
       VALUES (?, ?, ?, 'administrador', 1, 0, 0)`,
      [nombre, email, hash]
    );

    console.log('  Administrador creado exitosamente\n');
    console.log(`  ID:         ${result.insertId}`);
    console.log(`  Nombre:     ${nombre}`);
    console.log(`  Email:      ${email}`);
    console.log(`  Contrasena: ${password}`);
    console.log('\n  Guarda estas credenciales.\n');

  } catch (err) {
    console.error('  Error:', err.message);
    process.exit(1);
  }

  await pool.end();
}

main();
