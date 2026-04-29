const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'editor', 'admin'], default: 'user' },
    points: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
