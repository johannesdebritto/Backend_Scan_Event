const admin = require('firebase-admin');

const verifyFirebaseToken = async(req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.error("🔴 Token tidak ditemukan dalam request!");
        return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    try {
        console.log("🟢 Verifikasi token...");
        const decodedToken = await admin.auth().verifyIdToken(token);

        console.log("🟢 Token valid! UID:", decodedToken.uid);
        req.user = { firebase_uid: decodedToken.uid }; // ✅ Simpan UID dengan benar

        next();
    } catch (error) {
        console.error("❌ Token Firebase tidak valid:", error);
        return res.status(403).json({ error: 'Token tidak valid' });
    }
};

module.exports = verifyFirebaseToken;