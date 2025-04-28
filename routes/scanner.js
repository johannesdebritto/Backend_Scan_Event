const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const connectDB = require("../db");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken"); // Import koneksi database
const router = express.Router();

// Ambil data barang berdasarkan 'code'
router.get("/:code", verifyFirebaseToken, async (req, res) => {
  let connection;
  try {
    const firebase_uid = req.user ? req.user.firebase_uid : null; // Dapatkan UID dari Firebase
    const { code } = req.params; // Ambil 'code' dari URL parameter

    console.log("🟢 Menerima permintaan GET /api/barang/:code");
    console.log("🔍 UID dari Firebase:", firebase_uid);
    console.log("🔍 Code barang:", code);

    if (!firebase_uid) {
      console.error("🔴 UID tidak ditemukan dalam request!");
      return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    if (!code) {
      console.error("🔴 Code barang tidak ditemukan!");
      return res.status(400).json({ error: "Bad Request: Code tidak ditemukan" });
    }

    connection = await connectDB();
    console.log("🟢 Menjalankan query SELECT berdasarkan code dan UID:", firebase_uid, code);

    // Ambil data barang berdasarkan code dan firebase_uid
    const [items] = await connection.execute("SELECT * FROM items WHERE firebase_uid = ? AND code = ?", [firebase_uid, code]);

    if (items.length === 0) {
      console.log("🔴 Barang tidak ditemukan");
      return res.status(404).json({ error: "Barang tidak ditemukan" });
    }

    console.log("🟢 Data barang berhasil diambil:", items);
    res.status(200).json(items[0]); // Mengembalikan data barang pertama
  } catch (error) {
    console.error("🔴 Database error:", error);
    res.status(500).json({ error: "Database error", details: error.message });
  } finally {
    if (connection) await connection.end();
  }
});

module.exports = router;
