const express = require("express");
const router = express.Router();
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const connectDB = require('../db');

// Fungsi untuk mengubah format tanggal dari "DD-MM-YYYY" ke "YYYY-MM-DD"
function convertDateFormat(dateStr) {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
}

// Simpan event baru
router.post("/simpan", verifyFirebaseToken, async(req, res) => {
    const { nama_event, tanggal, kota, kabupaten } = req.body;
    const firebase_uid = req.user && req.user.firebase_uid;

    console.log("🟢 Menerima permintaan POST /event");
    console.log("🔍 UID dari Firebase:", firebase_uid);
    console.log("📦 Data diterima:", req.body);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    if (!nama_event || !tanggal || !kota || !kabupaten) {
        console.error("⚠️ Debug: Ada field yang kosong!");
        return res.status(400).json({ error: "Semua field harus diisi" });
    }

    // Konversi format tanggal
    const formattedDate = convertDateFormat(tanggal);
    if (!formattedDate) {
        console.error("⚠️ Format tanggal salah, seharusnya DD-MM-YYYY!");
        return res.status(400).json({ error: "Format tanggal tidak valid. Gunakan format DD-MM-YYYY" });
    }

    let connection;
    try {
        connection = await connectDB();

        console.log("🟢 Data yang akan disimpan:", { firebase_uid, nama_event, formattedDate, kota, kabupaten });

        // Jalankan query INSERT
        const [result] = await connection.execute(
            "INSERT INTO events (firebase_uid, nama_event, tanggal, kota, kabupaten) VALUES (?, ?, ?, ?, ?)", [firebase_uid, nama_event, formattedDate, kota, kabupaten]
        );

        console.log("✅ Event berhasil ditambahkan! ID:", result.insertId);

        res.status(201).json({ message: "Event berhasil ditambahkan", eventId: result.insertId });
    } catch (error) {
        console.error("🚨 Error saat menyimpan event:", error);
        res.status(500).json({ error: "Gagal menambahkan event", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;