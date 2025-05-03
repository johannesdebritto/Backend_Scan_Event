const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const connectDB = require("../db");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken"); // Import koneksi database
const router = express.Router();
const QRCode = require("qrcode");
const { createCanvas, registerFont } = require("canvas");

// Daftarkan font dengan nama family bebas (misal: "InterCustom")
registerFont(path.join(__dirname, "../fonts/Inter_18pt-Bold.ttf"), {
  family: "InterCustom",
});

// Pastikan folder 'images' dan 'qr_codes' ada
const imageFolder = path.join(__dirname, "../images"); // Folder untuk gambar barang
const qrCodeFolder = path.join(__dirname, "../qr_codes"); // Folder untuk gambar QR Code

// Membuat folder jika belum ada
[imageFolder, qrCodeFolder].forEach((folder) => {
  try {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      console.log(`Folder dibuat: ${folder}`);
    } else {
      console.log(`Folder sudah ada: ${folder}`);
    }
  } catch (err) {
    console.error(`Gagal membuat folder ${folder}:`, err);
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
      uploadFolder = path.join(__dirname, "../images", firebase_uid); // Folder gambar barang
    } else if (file.fieldname === "qr_code_image") {
      uploadFolder = path.join(__dirname, "../qr_codes", firebase_uid); // Folder QR Code
    } else {
      return cb(new Error("Invalid field name"), false);
    }

    // Buat folder jika belum ada
    try {
      if (!fs.existsSync(uploadFolder)) {
        fs.mkdirSync(uploadFolder, { recursive: true });
        console.log(`Folder tujuan dibuat: ${uploadFolder}`);
      }
    } catch (err) {
      console.error(`Gagal membuat folder ${uploadFolder}:`, err);
    }

    console.log(`📂 Folder tujuan: ${uploadFolder}`);
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename = file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
    console.log("📸 Filename:", filename);
    cb(null, filename);
  },
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
  limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal 5MB
}).fields([
  { name: "image", maxCount: 1 },
  { name: "qr_code_image", maxCount: 1 }, // Perbaiki nama field QR Code
]);

// Upload gambar barang dan QR Code dengan Firebase UID
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

      // Proses upload gambar barang
      const imageFileName = req.files["image"][0].filename;
      const imageUrl = `${firebase_uid}/${imageFileName}`;
      console.log("🖼️ Image saved:", imageUrl);

      const [insertResult] = await connection.execute(
        `INSERT INTO items (firebase_uid, name, quantity, code, brand, image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [firebase_uid, name, quantity, code, brand, imageUrl]
      );

      const itemId = insertResult.insertId;

      // Membuat QR Code
      const qrContent = JSON.stringify({
        name,
        quantity,
        code,
        brand,
        imageUrl,
      });

      console.log("📦 Data yang ada di dalam QR Code:");
      console.log(`📝 Name      : ${name}`);
      console.log(`🔢 Quantity  : ${quantity}`);
      console.log(`🏷️ Code      : ${code}`);
      console.log(`🏭 Brand     : ${brand}`);
      console.log(`🖼️ Image URL : ${imageUrl}`);

      // Atur ukuran QR dan padding
      const qrSize = 500; // Ukuran QR code dikurangi
      const padding = 30; // Padding dikurangi
      const textHeight = 50; // Tinggi area teks
      const totalWidth = qrSize + padding * 2;
      const totalHeight = qrSize + padding * 2 + textHeight;

      const canvas = createCanvas(totalWidth, totalHeight);
      const ctx = canvas.getContext("2d");

      // Latar belakang putih
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      // Tambahkan nama barang di atas QR code dengan format yang diminta
      // Tambahkan teks di atas QR code
      ctx.font = "28px InterCustom";
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";

      const namaText = `Nama: ${name}`;
      const textPosX = totalWidth / 2;
      const textPosY = 40; // Posisi Y yang aman biar tidak tertutup QR

      console.log("📝 Teks yang ditampilkan di atas QR:", namaText);
      console.log("📍 Posisi teks - X:", textPosX, "| Y:", textPosY);

      ctx.fillText(namaText, textPosX, textPosY);

      // Buat canvas QR code terpisah
      const qrCanvas = createCanvas(qrSize, qrSize);
      await QRCode.toCanvas(qrCanvas, qrContent, {
        width: qrSize,
        margin: 5,
        errorCorrectionLevel: "H",
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      // Gambar QR code ke canvas utama (di bawah teks)
      ctx.drawImage(qrCanvas, padding, padding + textHeight);

      // Simpan file QR Code
      const qrFileName = `qr_code_${itemId}.png`;
      const qrDir = path.join(__dirname, "../qr_codes", firebase_uid);
      if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
      const qrPath = path.join(qrDir, qrFileName);

      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(qrPath, buffer);

      const qrCodeUrl = `${firebase_uid}/${qrFileName}`;
      console.log("🔳 QR Code saved:", qrCodeUrl);

      // Update database dengan QR Code URL
      await connection.execute(`UPDATE items SET qr_code_url = ? WHERE id = ?`, [qrCodeUrl, itemId]);

      await connection.commit();

      res.status(201).json({
        message: "Barang berhasil ditambahkan dan QR Code dibuat",
        itemId,
        imageUrl,
        qrCodeUrl,
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("❌ Error saat menyimpan barang:", error);
      res.status(500).json({ error: "Gagal menambahkan barang", details: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });
});

//
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

// DELETE barang
router.delete("/:id", verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const firebase_uid = req.user.firebase_uid;
  let connection;

  try {
    connection = await connectDB();

    // 🔍 Cek apakah barang milik user
    const [item] = await connection.execute("SELECT * FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]);

    if (item.length === 0) {
      return res.status(404).json({ error: "Barang tidak ditemukan atau tidak memiliki akses" });
    }

    const imageUrl = item[0].image_url;
    const qrCodeUrl = item[0].qr_code_url;

    // 🔄 Hapus data barang dari database
    await connection.execute("DELETE FROM items WHERE id = ? AND firebase_uid = ?", [id, firebase_uid]);

    // 📂 Hapus file gambar barang jika ada
    if (imageUrl) {
      const imagePath = path.join(__dirname, "..", "images", imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`🗑️ Gambar barang dihapus: ${imagePath}`);
      } else {
        console.log(`⚠️ Gambar barang tidak ditemukan: ${imagePath}`);
      }
    }

    // 📂 Hapus file QR code jika ada
    if (qrCodeUrl) {
      const qrCodePath = path.join(__dirname, "..", "qr_codes", qrCodeUrl);
      if (fs.existsSync(qrCodePath)) {
        fs.unlinkSync(qrCodePath);
        console.log(`🗑️ QR Code dihapus: ${qrCodePath}`);
      } else {
        console.log(`⚠️ QR Code tidak ditemukan: ${qrCodePath}`);
      }
    }

    // 📂 Hapus folder user jika kosong
    const userImageFolder = path.join(__dirname, "..", "images", firebase_uid);
    const userQrCodeFolder = path.join(__dirname, "..", "qr_codes", firebase_uid);

    const removeFolderIfEmpty = (folderPath) => {
      try {
        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath);
          if (files.length === 0) {
            fs.rmdirSync(folderPath);
            console.log(`🗑️ Folder dihapus: ${folderPath}`);
          } else {
            console.log(`📂 Folder tidak kosong: ${folderPath}`);
          }
        }
      } catch (err) {
        console.log(`⚠️ Gagal hapus folder: ${folderPath}`, err.message);
      }
    };

    removeFolderIfEmpty(userImageFolder);
    removeFolderIfEmpty(userQrCodeFolder);

    res.status(200).json({ message: "Barang berhasil dihapus" });
  } catch (error) {
    console.error("🔴 Error saat menghapus barang:", error);
    res.status(500).json({ error: "Gagal menghapus barang", details: error.message });
  } finally {
    if (connection) await connection.end();
  }
});

//edit
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
