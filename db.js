const mysql = require("mysql2/promise");

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};

const connectDB = async() => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log("✅ Connected to MySQL");
        return connection;
    } catch (err) {
        console.error("❌ Database connection failed:", err);
        process.exit(1); // Keluar dari aplikasi jika koneksi gagal
    }
};

module.exports = connectDB;