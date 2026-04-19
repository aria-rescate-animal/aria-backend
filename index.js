const express = require('express');
const cors = require('cors');
require('dotenv').config();
// Importamos el módulo de DB para que intente la conexión al iniciar
require('./src/db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});
