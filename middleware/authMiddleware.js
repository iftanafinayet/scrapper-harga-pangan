const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
    }

    try {
        const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const user = await User.findById(verified.id).select('_id username role points isBanned');

        if (!user) {
            return res.status(401).json({ error: 'User tidak ditemukan.' });
        }

        if (user.isBanned) {
            return res.status(403).json({ error: 'Akun ini telah diblokir oleh admin.' });
        }

        req.user = {
            id: user._id.toString(),
            username: user.username,
            role: user.role,
            points: user.points
        };
        next();
    } catch (error) {
        res.status(400).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
    }
};

const verifyAdmin = async (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Akses ditolak. Endpoint ini khusus Admin.' });
        }
    });
};

module.exports = { verifyToken, verifyAdmin };
