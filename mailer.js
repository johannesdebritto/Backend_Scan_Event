const nodemailer = require("nodemailer");

// Konfigurasi transporter untuk mengirim email
const transporter = nodemailer.createTransport({
    service: 'gmail', // Anda bisa mengganti ini dengan penyedia email lain, seperti Yahoo atau SMTP server
    auth: {
        user: process.env.EMAIL_USER, // Email pengirim, pastikan disimpan di .env
        pass: process.env.EMAIL_PASS // Password email pengirim, pastikan disimpan di .env
    }
});

// Fungsi untuk mengirim email verifikasi
const sendVerificationEmail = (to, token) => {
    const verificationUrl = `http://localhost:5000/verify-email?token=${token}`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: "Verifikasi Email Anda",
        html: `
            <h1>Verifikasi Email Anda</h1>
            <p>Klik link berikut untuk verifikasi email anda:</p>
            <a href="${verificationUrl}">Verifikasi Email</a>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        } else {
            console.log("Email sent: " + info.response);
        }
    });
};

module.exports = { sendVerificationEmail };