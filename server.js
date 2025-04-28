const express = require("express");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const cors = require("cors");
const path = require("path"); // Menambahkan path module
const authRoutes = require("./routes/auth"); // Import route auth
const barangRoutes = require("./routes/barang"); // Import route barang
const eventRouter = require("./routes/event");
const scannerRouter = require("./routes/scanner");

const app = express();
const PORT = process.env.PORT || 5000;

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK from environment variable
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error("❌ FIREBASE_CREDENTIALS tidak ditemukan di environment variables!");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
console.log("✅ Firebase Admin SDK Initialized!");

// Enable CORS
app.use(cors());

// Middleware untuk JSON parsing
app.use(express.json());

// Middleware untuk logging request
app.use((req, res, next) => {
  console.log(`Request diterima: ${req.method} ${req.url}`);
  next();
});

// Menyajikan file statis dari folder images dan qr_codes
app.use("/images", express.static(path.join(__dirname, "images")));
app.use("/qr_codes", express.static(path.join(__dirname, "qr_codes")));

// Routes
app.use("/api/auth", authRoutes); // Hubungkan route auth
app.use("/api/barang", barangRoutes); // Hubungkan route barang
app.use("/api/event", eventRouter);
app.use("/api/scanner", scannerRouter);

// Test endpoint
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

// Jalankan server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server berjalan di http://0.0.0.0:${PORT}`);
});
