const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/test', (req, res) => {
  res.json({ mensaje: '¡Migración a Express exitosa! El servidor está vivo.' });
});

app.listen(PORT, () => {
  console.log(`Servidor ARIA corriendo en el puerto ${PORT}`);
});
// ...