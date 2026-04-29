const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getBootstrapAdminUsernames() {
    return String(process.env.ADMIN_USERNAMES || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function isBootstrapAdminUsername(username) {
    return getBootstrapAdminUsernames().includes(String(username || '').trim().toLowerCase());
}

async function resolveRoleForNewUser(username) {
    if (isBootstrapAdminUsername(username)) {
        return 'admin';
    }

    const [totalUsers, totalAdmins] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'admin' }),
    ]);

    if (totalUsers === 0 || totalAdmins === 0) {
        return 'admin';
    }

    return 'user';
}

async function syncBootstrapAdminRole(user) {
    if (!user) {
        return user;
    }

    if (isBootstrapAdminUsername(user.username) && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
        return user;
    }

    return user;
}

const register = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password wajib diisi' });
        }

        const normalizedUsername = username.trim();
        const existingUser = await User.findOne({ username: normalizedUsername });
        if (existingUser) {
            return res.status(400).json({ error: 'Username sudah digunakan' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const assignedRole = await resolveRoleForNewUser(normalizedUsername);

        const newUser = new User({
            username: normalizedUsername,
            password: hashedPassword,
            role: assignedRole,
            points: 0,
        });

        await newUser.save();

        res.status(201).json({
            message:
                assignedRole === 'admin'
                    ? 'Registrasi berhasil. Akun ini langsung memiliki role admin.'
                    : 'Registrasi berhasil. Silakan login.',
            role: assignedRole,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const normalizedUsername = username?.trim();

        let user = await User.findOne({ username: normalizedUsername });
        if (!user) {
            return res.status(400).json({ error: 'Username atau password salah' });
        }

        if (user.isBanned) {
            return res.status(403).json({ error: 'Akun ini diblokir oleh admin.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Username atau password salah' });
        }

        user = await syncBootstrapAdminRole(user);

        const token = jwt.sign(
            { id: user._id, role: user.role, username: user.username },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '1d' }
        );

        res.json({
            message: 'Login berhasil',
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                points: user.points,
                isBanned: user.isBanned,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    register,
    login,
};
