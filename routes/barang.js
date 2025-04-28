const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const connectDB = require("../db");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken"); // Import koneksi database
const router = express.Router();

// Folder yang sudah ada manual
const imageFolder = path.join(__dirname, "../images");
const qrCodeFolder = path.join(__dirname, "../qr_codes");

// Konfigurasi Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.user || !req.user.firebase_uid) {
      return cb(new Error("Unauthorized: UID tidak ditemukan"), false);
    }

    // Langsung tentukan folder berdasarkan fieldname
    if (file.fieldname === "image") {
      cb(null, imageFolder);
    } else if (file.fieldname === "qr_code_image") {
      cb(null, qrCodeFolder);
    } else {
      cb(new Error("Invalid field name"), false);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename = file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, JPG, PNG, GIF, and WEBP are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal 5MB
}).fields([
  { name: "image", maxCount: 1 },
  { name: "qr_code_image", maxCount: 1 },
]);

router.post("/", verifyFirebaseToken, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { name, quantity, code, brand } = req.body;
    const firebase_uid = req.user && req.user.firebase_uid;

    if (!firebase_uid) {
      return res.status(401).json({ error: "Unauthorized: UID tidak ditemukan" });
    }

    if (!name || !quantity || !code || !brand) {
      return res.status(400).json({ error: "Semua field harus diisi" });
    }

    if (!req.files || !req.files["image"]) {
      return res.status(400).json({ error: "Gambar barang harus diunggah" });
    }

    let connection;
    try {
      connection = await connectDB();
      await connection.beginTransaction();

      // Simpan nama file saja karena foldernya sudah tetap
      const imageUrl = req.files["image"][0].filename;

      let qrCodeUrl = null;
      if (req.files["qr_code_image"]) {
        qrCodeUrl = req.files["qr_code_image"][0].filename;
      }

      const [result] = await connection.execute(
        `INSERT INTO items (
          firebase_uid, name, quantity, code, brand, image_url, qr_code_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [firebase_uid, name, quantity, code, brand, imageUrl, qrCodeUrl]
      );

      await connection.commit();
      res.status(201).json({ message: "Barang berhasil ditambahkan", itemId: result.insertId });
    } catch (error) {
      if (connection) await connection.rollback();
      res.status(500).json({ error: "Gagal menambahkan barang", details: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });
});
//ambil data barang
router.get("/", verifyFirebaseToken, async (req, res) => {
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

    const [items] = await connection.execute("SELECT * FROM items WHERE firebase_uid = ?", [firebase_uid]);

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
router.delete("/:id", verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const firebase_uid = req.user.firebase_uid;
  let connection;

  try {
    connection = await connectDB();

    // 🔍 Cek apakah barang dengan ID tersebut benar-benar milik firebase_uid yang sedang login
    const [item] = await connection.execute("SELECT * FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]);

    if (item.length === 0) {
      return res.status(404).json({ error: "Barang tidak ditemukan atau tidak memiliki akses" });
    }

    const imageUrl = item[0].image_url;

    // 🔄 Hapus data barang dari database
    await connection.execute("DELETE FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]);

    // 📂 Hapus file gambar barang jika ada
    const imagePath = path.join(__dirname, "../images", imageUrl);

    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log(`🗑️ Gambar barang dihapus: ${imagePath}`);
    }

    res.status(200).json({ message: "Barang berhasil dihapus" });
  } catch (error) {
    console.error("🔴 Error saat menghapus barang:", error);
    res.status(500).json({ error: "Gagal menghapus barang", details: error.message });
  } finally {
    if (connection) await connection.end();
  }
});

router.put("/:id", verifyFirebaseToken, (req, res) => {
  upload(req, res, async (err) => {
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
      const [oldItem] = await connection.execute("SELECT * FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]);

      if (oldItem.length === 0) {
        return res.status(404).json({ error: "Barang tidak ditemukan atau tidak memiliki akses" });
      }

      let imageUrl = oldItem[0].image_url;

      // 🔍 Jika pengguna mengunggah gambar baru, hapus gambar lama
      if (req.files && req.files["image"] && req.files["image"].length > 0) {
        const oldImagePath = path.join(__dirname, "../images", imageUrl);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath); // Hapus gambar lama
        }
        imageUrl = `${firebase_uid}/${req.files["image"][0].filename}`; // Simpan gambar baru
      }

      // 🔄 Update data di database
      await connection.execute("UPDATE items SET name = ?, quantity = ?, code = ?, brand = ?, image_url = ? WHERE id = ? AND firebase_uid = ?", [name, quantity, code, brand, imageUrl, id, firebase_uid]);

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
router.get("/brands", verifyFirebaseToken, async (req, res) => {
  let connection;
  try {
    connection = await connectDB(); // 🔥 Pastikan koneksi ke database berhasil
    const query = "SELECT id, name FROM brands ORDER BY name";
    const [brands] = await connection.execute(query); // ✅ Ganti db.query() ke connection.execute()
    console.log("🟢 Data brands:", brands);

    res.json(brands);
  } catch (error) {
    console.error("❌ Error fetching brands:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    if (connection) await connection.end(); // 🔥 Pastikan koneksi ditutup
  }
});

module.exports = router;
