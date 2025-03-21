const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const connectDB = require('../db');
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken"); // Import koneksi database
const router = express.Router();

// Pastikan folder `images` dan `barcodes` ada
const imageFolder = path.join(__dirname, '../images'); // Folder untuk gambar barang
const barcodeFolder = path.join(__dirname, '../barcodes'); // Folder untuk gambar barcode

// Membuat folder jika belum ada
[imageFolder, barcodeFolder].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// Konfigurasi Multer dengan UID Firebase
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!req.user || !req.user.firebase_uid) {
            return cb(new Error("Unauthorized: UID tidak ditemukan"), false);
        }

        const firebase_uid = req.user.firebase_uid; // Ambil UID dari request
        let uploadFolder = "";

        // Tentukan folder berdasarkan jenis file
        if (file.fieldname === "image") {
            uploadFolder = path.join(__dirname, "../images", firebase_uid);
        } else if (file.fieldname === "barcodeImage") {
            uploadFolder = path.join(__dirname, "../barcodes", firebase_uid);
        } else {
            return cb(new Error("Invalid field name"), false);
        }

        // Buat folder jika belum ada
        if (!fs.existsSync(uploadFolder)) {
            fs.mkdirSync(uploadFolder, { recursive: true });
        }

        console.log(`📂 Folder tujuan: ${uploadFolder}`);
        cb(null, uploadFolder);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const filename = file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
        console.log("📸 Filename:", filename);
        cb(null, filename);
    }
});

// Filter jenis file yang diperbolehkan
const fileFilter = (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only JPEG, JPG, PNG, GIF, and WEBP are allowed."), false);
    }
};

// Konfigurasi Multer
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // Maksimal 5MB
}).fields([
    { name: "image", maxCount: 1 },
    { name: "barcodeImage", maxCount: 1 }
]);

// Upload gambar barang & barcode dengan firebase_uid dari Firebase Auth
// Upload gambar barang & barcode dengan Firebase UID
router.post("/", verifyFirebaseToken, (req, res) => {
    upload(req, res, async(err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        const { name, quantity, code, brand } = req.body;
        const firebase_uid = req.user && req.user.firebase_uid;

        console.log("🟢 Menerima permintaan POST /api/barang");
        console.log("🔍 UID dari Firebase:", firebase_uid);

        if (!firebase_uid) {
            console.error("🔴 UID tidak ditemukan dalam request!");
            return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
        }

        if (!name || !quantity || !code || !brand) {
            return res.status(400).json({ error: "Semua field harus diisi" });
        }

        if (!req.files || !req.files["image"] || !req.files["barcodeImage"]) {
            return res.status(400).json({ error: "Gambar barang dan barcode harus diunggah" });
        }

        let connection;
        try {
            connection = await connectDB();
            await connection.beginTransaction();

            // Simpan path sesuai dengan folder UID
            const imageUrl = `${firebase_uid}/${req.files["image"][0].filename}`;
            const barcodeImageUrl = `${firebase_uid}/${req.files["barcodeImage"][0].filename}`;

            console.log("🟢 Menjalankan query INSERT dengan UID:", firebase_uid);

            const [result] = await connection.execute(
                "INSERT INTO items (firebase_uid, name, quantity, code, brand, image_url, barcode_image_url) VALUES (?, ?, ?, ?, ?, ?, ?)", [firebase_uid, name, quantity, code, brand, imageUrl, barcodeImageUrl]
            );

            await connection.commit();
            console.log("🟢 Barang berhasil ditambahkan! ID:", result.insertId);
            res.status(201).json({ message: "Barang berhasil ditambahkan", itemId: result.insertId });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error("🔴 Error saat menyimpan barang:", error);
            res.status(500).json({ error: "Gagal menambahkan barang", details: error.message });
        } finally {
            if (connection) await connection.end();
        }
    });
});

//ambil data barang
router.get("/", verifyFirebaseToken, async(req, res) => {
    let connection;
    try {
        const firebase_uid = req.user ? req.user.firebase_uid : null; // ✅ FIXED

        console.log("🟢 Menerima permintaan GET /api/barang");
        console.log("🔍 UID dari Firebase:", firebase_uid);

        if (!firebase_uid) {
            console.error("🔴 UID tidak ditemukan dalam request!");
            return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
        }

        connection = await connectDB();
        console.log("🟢 Menjalankan query SELECT dengan UID:", firebase_uid);

        const [items] = await connection.execute(
            "SELECT * FROM items WHERE firebase_uid = ?", [firebase_uid]
        );

        console.log("🟢 Data barang berhasil diambil:", items);
        res.status(200).json(items);
    } catch (error) {
        console.error("🔴 Database error:", error);
        res.status(500).json({ error: "Database error", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// Hapus barang berdasarkan ID dan firebase_uid dari Firebase
router.delete("/:id", verifyFirebaseToken, async(req, res) => {
    const { id } = req.params;
    const firebase_uid = req.user.firebase_uid;
    let connection;

    try {
        connection = await connectDB();

        // 🔍 Cek apakah barang dengan ID tersebut benar-benar milik firebase_uid yang sedang login
        const [item] = await connection.execute(
            "SELECT * FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]
        );

        if (item.length === 0) {
            return res.status(404).json({ error: "Barang tidak ditemukan atau tidak memiliki akses" });
        }

        const imageUrl = item[0].image_url;
        const barcodeImageUrl = item[0].barcode_image_url;

        // 🔄 Hapus data barang dari database
        await connection.execute("DELETE FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]);

        // 📂 Hapus file gambar barang & barcode jika ada
        const imagePath = path.join(__dirname, "../images", imageUrl);
        const barcodePath = path.join(__dirname, "../barcodes", barcodeImageUrl);

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`🗑️ Gambar barang dihapus: ${imagePath}`);
        }

        if (fs.existsSync(barcodePath)) {
            fs.unlinkSync(barcodePath);
            console.log(`🗑️ Gambar barcode dihapus: ${barcodePath}`);
        }

        res.status(200).json({ message: "Barang berhasil dihapus" });

    } catch (error) {
        console.error("🔴 Error saat menghapus barang:", error);
        res.status(500).json({ error: "Gagal menghapus barang", details: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// Edit barang berdasarkan ID dan firebase_uid dari Firebase
router.put("/:id", verifyFirebaseToken, (req, res) => {
    upload(req, res, async(err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        const { id } = req.params;
        const { name, quantity, code, brand } = req.body;
        const firebase_uid = req.user.firebase_uid;

        if (!name || !quantity || !code || !brand) {
            return res.status(400).json({ error: "Semua field harus diisi" });
        }

        let connection;
        try {
            connection = await connectDB();
            await connection.beginTransaction();

            // 🔍 Ambil data lama dari database
            const [oldItem] = await connection.execute(
                "SELECT * FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]
            );

            if (oldItem.length === 0) {
                return res.status(404).json({ error: "Barang tidak ditemukan atau tidak memiliki akses" });
            }

            let imageUrl = oldItem[0].image_url;
            let barcodeImageUrl = oldItem[0].barcode_image_url;

            // 🔍 Jika pengguna mengunggah gambar baru, hapus gambar lama
            if (req.files && req.files["image"] && req.files["image"].length > 0) {
                const oldImagePath = path.join(__dirname, "../images", imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath); // Hapus gambar lama
                }
                imageUrl = `${firebase_uid}/${req.files["image"][0].filename}`; // Simpan gambar baru
            }

            // 🔍 Jika pengguna mengunggah gambar barcode baru, hapus gambar barcode lama
            if (req.files && req.files["barcodeImage"] && req.files["barcodeImage"].length > 0) {
                const oldBarcodePath = path.join(__dirname, "../barcodes", barcodeImageUrl);
                if (fs.existsSync(oldBarcodePath)) {
                    fs.unlinkSync(oldBarcodePath); // Hapus barcode lama
                }
                barcodeImageUrl = `${firebase_uid}/${req.files["barcodeImage"][0].filename}`; // Simpan barcode baru
            }

            // 🔄 Update data di database
            await connection.execute(
                "UPDATE items SET name = ?, quantity = ?, code = ?, brand = ?, image_url = ?, barcode_image_url = ? WHERE id = ? AND firebase_uid = ?", [name, quantity, code, brand, imageUrl, barcodeImageUrl, id, firebase_uid]
            );

            await connection.commit();
            res.status(200).json({ message: "Barang berhasil diperbarui" });

        } catch (error) {
            console.error("🔴 Error saat memperbarui barang:", error);
            if (connection) await connection.rollback();
            res.status(500).json({ error: "Gagal memperbarui barang", details: error.message });
        } finally {
            if (connection) await connection.end();
        }
    });
});


// Endpoint untuk mendapatkan daftar brands
router.get('/brands', verifyFirebaseToken, async(req, res) => {
    let connection;
    try {
        connection = await connectDB(); // 🔥 Pastikan koneksi ke database berhasil
        const query = 'SELECT id, name FROM brands ORDER BY name';
        const [brands] = await connection.execute(query); // ✅ Ganti db.query() ke connection.execute()
        console.log("🟢 Data brands:", brands);

        res.json(brands);
    } catch (error) {
        console.error('❌ Error fetching brands:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (connection) await connection.end(); // 🔥 Pastikan koneksi ditutup
    }
});



module.exports = router;