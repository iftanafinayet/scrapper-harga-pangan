const mongoose = require('mongoose');

const scrapeLogSchema = new mongoose.Schema({
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const scrapeJobSchema = new mongoose.Schema({
    triggerSource: { type: String, enum: ['manual', 'cron'], default: 'manual' },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['running', 'success', 'failed', 'interrupted'], default: 'running' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    insertedCount: { type: Number, default: 0 },
    logs: { type: [scrapeLogSchema], default: [] },
    errorMessage: { type: String, default: '' }
}, {
    timestamps: true
});

scrapeJobSchema.index({ status: 1, startedAt: -1 });

module.exports = mongoose.model('ScrapeJob', scrapeJobSchema);
