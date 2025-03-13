const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'MySql@8899',
            database: 'scan_barang',
        });
        console.log('Koneksi ke database berhasil!');
        await connection.end();
    } catch (err) {
        console.error('Koneksi gagal:', err.message);
    }
}

testConnection();