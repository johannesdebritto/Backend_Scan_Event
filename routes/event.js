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

        // **Ambil ID status untuk "dipakai" dari tabel status**
        const [status] = await connection.execute(
            "SELECT id_status FROM status WHERE nama_status = 'dipakai' LIMIT 1"
        );

        if (status.length === 0) {
            console.error("❌ Status 'dipakai' tidak ditemukan di database!");
            return res.status(500).json({ error: "Gagal menemukan status default" });
        }

        const id_status = status[0].id_status; // ID status dari database

        // **Simpan data event dengan id_status yang diambil dari database**
        const [result] = await connection.execute(
            "INSERT INTO events (firebase_uid, nama_event, tanggal, kota, kabupaten, id_status, waktu_dibuat) VALUES (?, ?, ?, ?, ?, ?, ?)", [firebase_uid, nama_event, formattedDate, kota, kabupaten, id_status, waktuDibuat]
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

        const scanDate = new Date().toLocaleDateString("id-ID").split("/").reverse().join("-"); // YYYY-MM-DD (WIB)
        const scanTime = getCurrentTimeWIB(); // HH:mm:ss (WIB)

        await connection.execute(
            "INSERT INTO qr_codes (id_event, firebase_uid, qr_code, scan_date, scan_time, id_status) VALUES (?, ?, ?, ?, ?, ?)", [id_event, firebase_uid, qr_code, scanDate, scanTime, 2]
        );


        console.log("✅ QR Code berhasil disimpan dengan status 'dipakai'!");
        res.status(201).json({ message: "QR Code berhasil disimpan", id_event });

    } catch (error) {
        console.error("🚨 Error saat menyimpan QR code:", error);
        res.status(500).json({ error: "Gagal menyimpan QR code", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

//cek qr
router.get("/check-qrcode", verifyFirebaseToken, async(req, res) => {
    const firebase_uid = req.user && req.user.firebase_uid; // Ambil UID dari token Firebase

    console.log("🔍 Firebase UID:", firebase_uid);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    let connection;
    try {
        connection = await connectDB();

        // Ambil event ID terbaru berdasarkan Firebase UID
        const [event] = await connection.execute(
            "SELECT id_event FROM events WHERE firebase_uid = ? ORDER BY id_event DESC LIMIT 1", [firebase_uid]
        );

        if (event.length === 0) {
            console.warn("⚠️ Tidak ada event yang ditemukan untuk UID ini!");
            return res.status(404).json({ error: "Event tidak ditemukan untuk pengguna ini" });
        }

        const id_event = event[0].id_event;
        console.log("📌 ID Event ditemukan:", id_event);

        // Cek apakah ada QR code dalam event terbaru
        const [existingQR] = await connection.execute(
            "SELECT COUNT(*) as count FROM qr_codes WHERE id_event = ?", [id_event]
        );

        const qrExists = existingQR[0].count > 0;

        console.log(qrExists ? "✅ QR Code ditemukan dalam event ini!" : "⚠️ Belum ada QR Code yang di-scan.");

        res.status(200).json({ exists: qrExists, id_event });
    } catch (error) {
        console.error("🚨 Error saat mengecek QR code:", error);
        res.status(500).json({ error: "Gagal mengecek QR code", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// Ambil daftar event berdasarkan Firebase UID
router.get("/tampil", verifyFirebaseToken, async(req, res) => {
    const firebase_uid = req.user && req.user.firebase_uid;

    console.log("🟢 Menerima permintaan GET /event");
    console.log("🔍 UID dari Firebase:", firebase_uid);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    let connection;
    try {
        connection = await connectDB();

        // Ambil daftar event berdasarkan Firebase UID
        const [events] = await connection.execute(
            "SELECT e.id_event, e.nama_event, e.tanggal, e.kota, e.kabupaten, s.nama_status AS status, e.waktu_dibuat " +
            "FROM events e " +
            "JOIN status s ON e.id_status = s.id_status " +
            "WHERE e.firebase_uid = ? " +
            "ORDER BY e.tanggal DESC", [firebase_uid]
        );

        console.log("✅ Data event ditemukan:", events.length, "event(s)");
        res.status(200).json(events);

    } catch (error) {
        console.error("🚨 Error saat mengambil event:", error);
        res.status(500).json({ error: "Gagal mengambil event", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});



// Ambil detail event berdasarkan id_event
router.get("/detail/:id_event", verifyFirebaseToken, async(req, res) => {
    const firebase_uid = req.user && req.user.firebase_uid;
    const { id_event } = req.params;

    console.log(`🟢 Menerima permintaan GET /event/detail/${id_event}`);
    console.log("🔍 UID dari Firebase:", firebase_uid);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    let connection;
    try {
        connection = await connectDB();

        // Ambil detail event berdasarkan id_event dan Firebase UID
        const [event] = await connection.execute(
            `SELECT e.id_event, e.nama_event, e.tanggal, e.kota, e.kabupaten, s.nama_status AS status, e.waktu_dibuat 
             FROM events e
             JOIN status s ON e.id_status = s.id_status 
             WHERE e.id_event = ? AND e.firebase_uid = ?`, [id_event, firebase_uid]
        );

        if (event.length > 0) {
            console.log("✅ Data event ditemukan:", event[0]);
            res.status(200).json(event[0]);
        } else {
            console.error("🔴 Event tidak ditemukan!");
            res.status(404).json({ error: "Event tidak ditemukan" });
        }

    } catch (error) {
        console.error("🚨 Error saat mengambil detail event:", error);
        res.status(500).json({ error: "Gagal mengambil detail event", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// Ambil daftar barang (QR Code) berdasarkan id_event dan firebase_uid
router.get("/tampil_scan", verifyFirebaseToken, async(req, res) => {
    const firebase_uid = req.user && req.user.firebase_uid;
    const { id_event } = req.query; // Ambil id_event dari query parameter

    console.log("🟢 Menerima permintaan GET /tampil_scan");
    console.log("🔍 Firebase UID:", firebase_uid);
    console.log("📌 ID Event:", id_event);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    if (!id_event) {
        console.error("⚠️ ID Event tidak diberikan!");
        return res.status(400).json({ error: "ID Event harus disertakan dalam query" });
    }

    let connection;
    try {
        connection = await connectDB();

        // Ambil daftar QR Code berdasarkan id_event dan firebase_uid
        const [qrList] = await connection.execute(
            "SELECT qr_code, scan_date, scan_time, id_status FROM qr_codes WHERE id_event = ? AND firebase_uid = ?", [id_event, firebase_uid]
        );

        console.log("✅ Data QR Code ditemukan:", qrList.length, "item");

        res.status(200).json({ message: "Data QR Code berhasil diambil", data: qrList });

    } catch (error) {
        console.error("🚨 Error saat mengambil data QR Code:", error);
        res.status(500).json({ error: "Gagal mengambil data QR Code", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// Hapus event dan QR Code berdasarkan Firebase UID dan id_event
router.delete("/hapus/:id_event", verifyFirebaseToken, async(req, res) => {
    const firebase_uid = req.user && req.user.firebase_uid;
    const { id_event } = req.params;

    console.log("🟢 Menerima permintaan DELETE /event");
    console.log("🔍 UID dari Firebase:", firebase_uid);
    console.log("🔍 ID Event yang akan dihapus:", id_event);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    let connection;
    try {
        connection = await connectDB();

        // Periksa apakah event milik user dengan Firebase UID yang sesuai
        const [event] = await connection.execute(
            "SELECT id_event FROM events WHERE id_event = ? AND firebase_uid = ?", [id_event, firebase_uid]
        );

        if (event.length === 0) {
            console.error("🔴 Event tidak ditemukan atau bukan milik user ini!");
            return res.status(404).json({ error: "Event tidak ditemukan atau tidak memiliki izin" });
        }

        // Hapus semua QR Code terkait event
        await connection.execute("DELETE FROM qr_codes WHERE id_event = ?", [id_event]);
        console.log("✅ QR Code terkait event berhasil dihapus");

        // Hapus event jika valid
        await connection.execute("DELETE FROM events WHERE id_event = ?", [id_event]);
        console.log("✅ Event berhasil dihapus");

        res.status(200).json({ message: "Event dan QR Code berhasil dihapus" });
    } catch (error) {
        console.error("🚨 Error saat menghapus event dan QR Code:", error);
        res.status(500).json({ error: "Gagal menghapus event dan QR Code", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;