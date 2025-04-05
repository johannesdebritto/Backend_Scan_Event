const express = require('express');
const admin = require('firebase-admin');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const axios = require('axios');
const router = express.Router();
require('dotenv').config();

// Konfigurasi database MySQL
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Konfigurasi Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Firebase REST API URL
const firebaseUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;

// Endpoint registrasi
router.post('/register', async(req, res) => {
    const { email, password, username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username wajib diisi.' });
    }

    try {
        const userRecord = await admin.auth().createUser({ email, password });
        const query = 'INSERT INTO users (firebase_uid, email, username) VALUES (?, ?, ?)';
        await db.execute(query, [userRecord.uid, email, username]);

        res.status(201).json({ message: 'Pendaftaran berhasil!', userId: userRecord.uid });
    } catch (error) {
        console.error('Terjadi kesalahan saat mendaftarkan pengguna:', error.message);
        if (error.code === 'auth/email-already-exists') {
            res.status(400).json({ error: 'Email sudah terdaftar.' });
        } else {
            res.status(500).json({ error: 'Terjadi kesalahan saat pendaftaran.' });
        }
    }
});

// Endpoint verifikasi email
router.post('/send-verification-email', async(req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email tidak boleh kosong.' });
    }

    try {
        // Ambil username dari database berdasarkan email
        const [rows] = await db.execute('SELECT username FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Email tidak ditemukan.' });
        }

        const username = rows[0].username;

        // Buat tautan verifikasi
        const verificationLink = await admin.auth().generateEmailVerificationLink(email);

        // Buat email yang lebih profesional
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verifikasi Email Anda',
            html: `
                <p>Halo ${username},</p>
                <p>Terima kasih telah mendaftar di Aplikasi Scan Barang!</p>
                <p>Untuk menyelesaikan proses pendaftaran, silakan klik tautan berikut untuk memverifikasi email Anda:</p>
                <p><a href="${verificationLink}">Verifikasi Email</a></p>
                <p>Jika Anda tidak merasa mendaftar, Anda dapat mengabaikan email ini.</p>
                <p>Salam hangat,<br>Tim Codedev App</p>
            `,
        };

        // Kirim email
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Email verifikasi berhasil dikirim.' });
    } catch (error) {
        console.error('Terjadi kesalahan:', error.message);
        res.status(500).json({ error: 'Gagal mengirim email verifikasi.' });
    }
});
//login
router.post('/login', async(req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    try {
        // Dapatkan informasi pengguna dari Firebase
        const userRecord = await admin.auth().getUserByEmail(email);

        // Periksa apakah email sudah diverifikasi
        if (!userRecord.emailVerified) {
            return res.status(403).json({ error: 'Silakan verifikasi email Anda terlebih dahulu.' });
        }

        // Verifikasi password menggunakan Firebase REST API
        const firebaseUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;

        try {
            const response = await axios.post(firebaseUrl, {
                email,
                password,
                returnSecureToken: true,
            });

            // Ambil data user dari MySQL berdasarkan firebase_uid
            const [userRows] = await db.execute(
                'SELECT username FROM users WHERE firebase_uid = ?', [userRecord.uid]
            );

            if (userRows.length === 0) {
                return res.status(404).json({ error: 'Pengguna tidak ditemukan di database lokal.' });
            }

            const username = userRows[0].username;

            // Login berhasil, kirim token dan informasi user
            return res.status(200).json({
                message: 'Login berhasil.',
                idToken: response.data.idToken,
                refreshToken: response.data.refreshToken,
                username: username,
                uid: userRecord.uid,
            });
        } catch (error) {
            console.error('Error response from Firebase:', error.response ? error.response.data : error.message);

            if (error.response && error.response.data) {
                const firebaseError = error.response.data.error.message;

                if (firebaseError === 'EMAIL_NOT_FOUND') {
                    return res.status(404).json({ error: 'Email tidak terdaftar.' });
                }

                if (firebaseError === 'INVALID_PASSWORD' || firebaseError === 'INVALID_LOGIN_CREDENTIALS') {
                    return res.status(401).json({ error: 'Password salah.' });
                }

                return res.status(400).json({ error: 'Terjadi kesalahan saat login.' });
            }

            console.error('Kesalahan saat login:', error.message);
            return res.status(500).json({ error: 'Terjadi kesalahan saat login.' });
        }
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ error: 'Email tidak terdaftar.' });
        }

        console.error('Kesalahan server:', error.message);
        return res.status(500).json({ error: 'Terjadi kesalahan server.' });
    }
});


router.post('/logout', async(req, res) => {
    try {
        // Logout dalam Firebase tidak memerlukan pemrosesan di server,
        // karena token ada di sisi klien.
        // Namun, kita bisa mengimplementasikan mekanisme pemblokiran token jika diperlukan.

        return res.status(200).json({ message: 'Logout berhasil. Silakan hapus token di sisi klien.' });
    } catch (error) {
        console.error('Kesalahan saat logout:', error.message);
        return res.status(500).json({ error: 'Terjadi kesalahan saat logout.' });
    }
});


router.post('/forgot-password', async(req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email tidak boleh kosong.' });
    }

    try {
        console.log(`Mencari pengguna dengan email: ${email}`);

        // Verifikasi apakah email terdaftar di Firebase
        const user = await admin.auth().getUserByEmail(email);
        console.log('Pengguna ditemukan:', user);

        // Generate tautan reset password
        const resetLink = await admin.auth().generatePasswordResetLink(email);
        console.log('Tautan reset password:', resetLink);

        // Buat email yang akan dikirim
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Reset Password Anda',
            html: `
                <p>Halo,</p>
                <p>Silakan klik tautan berikut untuk mereset kata sandi Anda:</p>
                <p><a href="${resetLink}">Reset Password</a></p>
                <p>Jika Anda tidak merasa meminta reset password, Anda dapat mengabaikan email ini.</p>
            `,
        };

        // Kirimkan email dengan callback
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error saat mengirim email:', error);
                return res.status(500).json({ error: 'Gagal mengirimkan email reset password.' });
            } else {
                console.log('Email berhasil dikirim:', info.response);
                res.status(200).json({ message: 'Tautan reset password berhasil dikirim.' });
            }
        });
    } catch (error) {
        console.error('Error pada forgot password:', error.message);
        res.status(500).json({ error: 'Gagal mengirimkan tautan reset password.' });
    }
});


// Endpoint untuk Reset Password
router.post('/reset-password', async(req, res) => {
    const { oobCode, newPassword } = req.body;

    if (!oobCode || !newPassword) {
        return res.status(400).json({ error: 'Kode atau password baru tidak boleh kosong.' });
    }

    try {
        await admin.auth().verifyPasswordResetCode(oobCode);
        await admin.auth().confirmPasswordReset(oobCode, newPassword);

        res.status(200).json({ message: 'Password berhasil diperbarui.' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengubah password.' });
    }
});


// Ekspor router saja
module.exports = router;