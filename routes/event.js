const express = require("express");
const router = express.Router();
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const connectDB = require('../db');

const moment = require("moment");

router.post("/simpan", verifyFirebaseToken, async(req, res) => {
    const { nama_event, tanggal, kota, kabupaten } = req.body;
    const firebase_uid = req.user && req.user.firebase_uid;

    console.log("🟢 Menerima permintaan POST /event");
    console.log("🔍 UID dari Firebase:", firebase_uid);

    if (!firebase_uid) {
        console.error("🔴 UID tidak ditemukan dalam request!");
        return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    if (!nama_event || !tanggal || !kota || !kabupaten) {
        return res.status(400).json({ error: "Semua field harus diisi" });
    }

    // Konversi format tanggal dari "DD-MM-YYYY" ke "YYYY-MM-DD"
    let formattedDate;
    try {
        formattedDate = moment(tanggal, "DD-MM-YYYY").format("YYYY-MM-DD");
        if (!moment(formattedDate, "YYYY-MM-DD", true).isValid()) {
            throw new Error("Format tanggal tidak valid");
        }
    } catch (error) {
        return res.status(400).json({ error: "Format tanggal tidak valid", details: error.message });
    }

    let connection;
    try {
        connection = await connectDB();
        await connection.beginTransaction();

        console.log("🟢 Menjalankan query INSERT dengan UID:", firebase_uid);

        const [result] = await connection.execute(
            "INSERT INTO events (firebase_uid, nama_event, tanggal, kota, kabupaten) VALUES (?, ?, ?, ?, ?)", [firebase_uid, nama_event, formattedDate, kota, kabupaten]
        );

        await connection.commit();
        console.log("🟢 Event berhasil ditambahkan! ID:", result.insertId);
        res.status(201).json({ message: "Event berhasil ditambahkan", eventId: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("🔴 Error saat menyimpan event:", error);
        res.status(500).json({ error: "Gagal menambahkan event", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


module.exports = router;