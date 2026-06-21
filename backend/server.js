const express = require('express');
const path    = require('path');
require('dotenv').config();

const asetRouter      = require('./routes/aset');
const geojsonRouter   = require('./routes/geojson');
const statistikRouter = require('./routes/statistik');
const laporanRouter   = require('./routes/laporan');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const frontendPath = path.join(__dirname, '../frontend');
const gambarPath   = path.join(__dirname, '../gambar');

app.use(express.static(frontendPath));
app.use('/gambar', express.static(gambarPath));
app.use('/admin',  express.static(path.join(frontendPath, 'admin')));

app.use('/api/aset',      asetRouter);
app.use('/api/geojson',   geojsonRouter);
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);
app.use('/api/statistik', statistikRouter);
app.use('/api/laporan',   laporanRouter);
const usersRouter   = require('./routes/users');
const validasiRouter = require('./routes/validasi');
app.use('/api/users',    usersRouter);
app.use('/api/validasi', validasiRouter);
const feedbackRouter = require('./routes/feedback');
app.use('/api/feedback', feedbackRouter);

app.get('/',      (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
app.get('/peta',  (req, res) => res.sendFile(path.join(frontendPath, 'peta.html')));

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
