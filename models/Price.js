const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
    komoditas: { type: String, required: true },
    harga: { type: Number, required: true },
    lokasi: { type: String, required: true },
    catatan: { type: String, default: '' },
    koordinat: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }
    },
    tanggal: { type: Date, default: Date.now },
    sumber: { type: String, enum: ['official', 'user'], default: 'official' },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifications: { type: Number, default: 0 },
    moderationStatus: {
        type: String,
        enum: ['approved', 'pending', 'rejected'],
        default: function() {
            return this.sumber === 'user' ? 'pending' : 'approved';
        }
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' }
});

priceSchema.index({ komoditas: 1, tanggal: -1 });
priceSchema.index({ koordinat: '2dsphere' });
priceSchema.index({ moderationStatus: 1, sumber: 1, tanggal: -1 });

module.exports = mongoose.model('Price', priceSchema);
