const express = require('express');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const authRoutes = require('./routes/auth'); // Import route auth
const barangRoutes = require('./routes/barang'); // Import route barang

const path = require('path'); // Untuk menangani path file
const fs = require('fs'); // Untuk bekerja dengan file system

const app = express();
const PORT = process.env.PORT || 5000;

// Load environment variables
dotenv.config();


// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json'); // Path ke serviceAccountKey.json Anda
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
console.log("Firebase Admin SDK Initialized!");

// Enable CORS
const cors = require('cors');
app.use(cors());

// Middleware untuk JSON parsing
app.use(express.json());

// Middleware untuk logging request
app.use((req, res, next) => {
    console.log(`Request diterima: ${req.method} ${req.url}`);
    next();
});

app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/barcodes', express.static(path.join(__dirname, 'barcodes')));
// Routes
app.use('/api/auth', authRoutes); // Hubungkan route auth
app.use('/api/barang', barangRoutes); // Hubungkan route barang
// app.use('/api/upload', uploadRouter); // Hubungkan route upload

// Test endpoint
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Jalankan server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server berjalan di http://0.0.0.0:${PORT}`);
});