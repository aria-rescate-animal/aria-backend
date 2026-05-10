const test = require('node:test');
const assert = require('node:assert/strict');

const esPasswordValido = (password) => password.length >= 8;
const esEmailValido = (email) => email.includes('@');
const esRolValido = (rol) => rol === 'ciudadano' || rol === 'administrador';


test('Validar que la contraseña sea de al menos 8 caracteres', () => {
  // Clave correcta, tiene que dar true
  assert.strictEqual(esPasswordValido('Aria2026_Seguro'), true); 
  
  // Clave muy corta, nos tiene que dar false para que no pase
  assert.strictEqual(esPasswordValido('123'), false);            
});

test('Validar que el correo tenga el arroba', () => {
  // Correo bien escrito
  assert.strictEqual(esEmailValido('traste322@gmail.com'), true); 
  
  // Correo mal escrito para ver si de verdad lo rechaza
  assert.strictEqual(esEmailValido('correoSinArroba.com'), false); 
});

test('Validar que los roles sean solo los que existen en la BD', () => {
  // Rol normal del sistema
  assert.strictEqual(esRolValido('ciudadano'), true); 
  
  // Si mandan un rol inventado lo tiene que rebotar
  assert.strictEqual(esRolValido('hacker'), false);   
});
