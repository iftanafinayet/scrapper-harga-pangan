const mongoose = require('mongoose');

const notificationReadSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now }
}, { _id: false });

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    topic: { type: String, default: 'price_updates' },
    createdAt: { type: Date, default: Date.now },
    firebaseResponse: { type: String, default: '' },
    metadata: { type: Object, default: {} },
    readBy: { type: [notificationReadSchema], default: [] }
});

notificationSchema.index({ targetUser: 1, createdAt: -1 });
notificationSchema.index({ 'readBy.user': 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
