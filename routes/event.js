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

// Fungsi untuk mendapatkan waktu sekarang dalam format HH:mm:ss (WIB)
function getCurrentTimeWIB() {
    const now = new Date(); // Waktu saat ini dalam UTC
    now.setHours(now.getHours() + 7); // Tambah 7 jam untuk WIB
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
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

    // Dapatkan waktu dalam format WIB
    const waktuDibuat = getCurrentTimeWIB();

    let connection;
    try {
        connection = await connectDB();

        console.log("🟢 Data yang akan disimpan:", {
            firebase_uid,
            nama_event,
            formattedDate,
            kota,
            kabupaten,
            waktuDibuat,
        });

        // Jalankan query INSERT dengan tambahan waktu_dibuat
        const [result] = await connection.execute(
            "INSERT INTO events (firebase_uid, nama_event, tanggal, kota, kabupaten, waktu_dibuat) VALUES (?, ?, ?, ?, ?, ?)", [firebase_uid, nama_event, formattedDate, kota, kabupaten, waktuDibuat]
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

// Simpan hasil scan QR code
router.post("/scan", verifyFirebaseToken, async(req, res) => {
    const { qr_code } = req.body;
    const firebase_uid = req.user && req.user.firebase_uid;

    console.log("🟢 Menerima scan QR code:", qr_code);
    console.log("🔍 Firebase UID:", firebase_uid);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    if (!qr_code) {
        console.error("⚠️ QR Code kosong!");
        return res.status(400).json({ error: "QR Code harus diisi" });
    }

    let connection;
    try {
        connection = await connectDB();

        // **Ambil event ID terakhir berdasarkan Firebase UID**
        const [event] = await connection.execute(
            "SELECT id_event FROM events WHERE firebase_uid = ? ORDER BY id_event DESC LIMIT 1", [firebase_uid]
        );

        if (event.length === 0) {
            console.error("⚠️ Tidak ada event yang ditemukan untuk UID ini!");
            return res.status(404).json({ error: "Event tidak ditemukan untuk pengguna ini" });
        }

        const id_event = event[0].id_event;
        console.log("📌 ID Event ditemukan:", id_event);

        // **Cek apakah QR code sudah pernah discan dalam event ini**
        const [existingQR] = await connection.execute(
            "SELECT * FROM qr_codes WHERE id_event = ? AND qr_code = ?", [id_event, qr_code]
        );

        if (existingQR.length > 0) {
            console.warn("⚠️ QR Code sudah pernah discan untuk event ini!");
            return res.status(409).json({ error: "QR Code ini sudah ada di event ini" });
        }

        // **Simpan data scan ke tabel `qr_codes`**
        await connection.execute(
            "INSERT INTO qr_codes (id_event, firebase_uid, qr_code) VALUES (?, ?, ?)", [id_event, firebase_uid, qr_code]
        );

        console.log("✅ QR Code berhasil disimpan!");
        res.status(201).json({ message: "QR Code berhasil disimpan", id_event });

    } catch (error) {
        console.error("🚨 Error saat menyimpan QR code:", error);
        res.status(500).json({ error: "Gagal menyimpan QR code", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;