const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const Price = require('../models/Price');
const Commodity = require('../models/Commodity');
const User = require('../models/User');
const { triggerScrape, getLogs, getScrapeStatus } = require('../services/scraperService');
const { sendBroadcastNotification, createUserNotification } = require('../services/notificationService');

const APPROVAL_REWARD_POINTS = 10;
const REJECTION_PENALTY_POINTS = -20;

function buildCsv(rows) {
    if (rows.length === 0) {
        return '';
    }

    const headers = Object.keys(rows[0]);
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((row) => headers.map((header) => escape(row[header])).join(','));
    return [headers.join(','), ...lines].join('\n');
}

async function annotateWithAnomaly(report) {
    const officialReference = await Price.findOne({ komoditas: report.komoditas, sumber: 'official' }).sort({ tanggal: -1 });
    const deviationPercent = officialReference?.harga
        ? Number((((report.harga - officialReference.harga) / officialReference.harga) * 100).toFixed(1))
        : null;
    const absoluteDeviation = Math.abs(deviationPercent ?? 0);
    const riskLevel = deviationPercent === null
        ? 'needs-context'
        : absoluteDeviation >= 100
            ? 'critical'
            : absoluteDeviation >= 50
                ? 'high'
                : 'normal';

    return {
        ...report.toObject(),
        moderationKey: report._id.toString(),
        referencePrice: officialReference?.harga ?? null,
        referenceDate: officialReference?.tanggal ?? null,
        officialReference: officialReference
            ? {
                harga: officialReference.harga,
                lokasi: officialReference.lokasi,
                tanggal: officialReference.tanggal,
            }
            : null,
        anomaly: deviationPercent !== null && Math.abs(deviationPercent) >= 50,
        deviationPercent,
        riskLevel,
    };
}

router.get('/stats', verifyAdmin, async (req, res) => {
    const [
        totalReports,
        pendingReports,
        approvedUserReports,
        rejectedReports,
        totalUsers,
        bannedUsers,
        latestScrape,
        latestRunningState,
    ] = await Promise.all([
        Price.countDocuments({ sumber: 'user' }),
        Price.countDocuments({ sumber: 'user', moderationStatus: 'pending' }),
        Price.countDocuments({ sumber: 'user', moderationStatus: 'approved' }),
        Price.countDocuments({ sumber: 'user', moderationStatus: 'rejected' }),
        User.countDocuments(),
        User.countDocuments({ isBanned: true }),
        Price.findOne({ sumber: 'official' }).sort({ tanggal: -1 }),
        getScrapeStatus(),
    ]);

    res.json({
        totalReports,
        pendingReports,
        approvedUserReports,
        rejectedReports,
        totalUsers,
        bannedUsers,
        lastScrapeDate: latestScrape?.tanggal || null,
        isScraping: latestRunningState.isScraping,
        latestScrapeJob: latestRunningState.latestJob || null,
    });
});

router.get('/reports/pending', verifyAdmin, async (req, res) => {
    const search = (req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const query = { sumber: 'user', moderationStatus: 'pending' };
    if (search) {
        query.$or = [
            { komoditas: new RegExp(search, 'i') },
            { lokasi: new RegExp(search, 'i') },
        ];
    }

    const reports = await Price.find(query)
        .sort({ tanggal: -1 })
        .limit(limit)
        .populate('reportedBy', 'username points role');

    let enrichedReports = await Promise.all(reports.map(annotateWithAnomaly));
    if (search) {
        enrichedReports = enrichedReports.filter((report) => report.reportedBy?.username?.toLowerCase().includes(search.toLowerCase()) || report.komoditas?.toLowerCase().includes(search.toLowerCase()) || report.lokasi?.toLowerCase().includes(search.toLowerCase()));
    }

    res.json(enrichedReports);
});

router.patch('/reports/:id/moderate', verifyAdmin, async (req, res) => {
    const { action, note } = req.body;
    const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;

    if (!nextStatus) {
        return res.status(400).json({ error: 'Action harus berupa approve atau reject.' });
    }
    if (nextStatus === 'rejected' && !String(note || '').trim()) {
        return res.status(400).json({ error: 'Alasan penolakan wajib diisi.' });
    }

    const report = await Price.findOne({ _id: req.params.id, sumber: 'user' }).populate('reportedBy', 'username');
    if (!report) {
        return res.status(404).json({ error: 'Laporan user tidak ditemukan.' });
    }
    if (report.moderationStatus !== 'pending') {
        return res.status(400).json({ error: 'Laporan ini sudah pernah dimoderasi.' });
    }

    report.moderationStatus = nextStatus;
    report.reviewNote = String(note || '').trim();
    report.reviewedAt = new Date();
    report.reviewedBy = req.user.id;
    await report.save();

    let pointsDelta = 0;
    if (report.reportedBy?._id) {
        if (nextStatus === 'approved') {
            pointsDelta = APPROVAL_REWARD_POINTS;
        }
        if (nextStatus === 'rejected') {
            pointsDelta = REJECTION_PENALTY_POINTS;
        }

        if (pointsDelta !== 0) {
            await User.findByIdAndUpdate(report.reportedBy._id, { $inc: { points: pointsDelta } });
        }

        await createUserNotification({
            title: nextStatus === 'approved' ? 'Laporan Anda disetujui' : 'Laporan Anda ditolak',
            body: nextStatus === 'approved'
                ? `Laporan ${report.komoditas} di ${report.lokasi} disetujui admin. Anda mendapat +${APPROVAL_REWARD_POINTS} poin.`
                : `Laporan ${report.komoditas} di ${report.lokasi} ditolak admin. Poin Anda berubah ${REJECTION_PENALTY_POINTS}. Alasan: ${report.reviewNote}`,
            targetUser: report.reportedBy._id,
            sentBy: req.user.id,
            metadata: {
                type: 'moderation_feedback',
                reportId: report._id.toString(),
                moderationStatus: nextStatus,
                reviewNote: report.reviewNote,
                pointsDelta,
            },
        });
    }

    res.json({
        message: nextStatus === 'approved'
            ? `Laporan berhasil di-approve. Reward +${APPROVAL_REWARD_POINTS} poin diberikan.`
            : `Laporan berhasil di-reject. Penalti ${REJECTION_PENALTY_POINTS} poin diterapkan.`,
        report,
        pointsDelta,
    });
});

router.get('/users', verifyAdmin, async (req, res) => {
    const search = (req.query.q || '').trim();
    const userQuery = search ? { username: new RegExp(search, 'i') } : {};

    const users = await User.find(userQuery)
        .select('-password')
        .sort({ points: -1, createdAt: -1 });

    const enrichedUsers = await Promise.all(users.map(async (user) => {
        const [reportCount, pendingCount, rejectedCount, approvedCount, latestReport] = await Promise.all([
            Price.countDocuments({ reportedBy: user._id }),
            Price.countDocuments({ reportedBy: user._id, moderationStatus: 'pending' }),
            Price.countDocuments({ reportedBy: user._id, moderationStatus: 'rejected' }),
            Price.countDocuments({ reportedBy: user._id, moderationStatus: 'approved' }),
            Price.findOne({ reportedBy: user._id }).sort({ tanggal: -1 }),
        ]);

        return {
            ...user.toObject(),
            id: user._id.toString(),
            banned: user.isBanned,
            reports: reportCount,
            suspiciousReports: rejectedCount,
            latestAt: latestReport?.tanggal || null,
            reportCount,
            pendingCount,
            rejectedCount,
            approvedCount,
            latestReportAt: latestReport?.tanggal || null,
        };
    }));

    res.json(enrichedUsers);
});

router.get('/users/:id/reports', verifyAdmin, async (req, res) => {
    const reports = await Price.find({ reportedBy: req.params.id, sumber: 'user' })
        .sort({ tanggal: -1 })
        .limit(50)
        .populate('reviewedBy', 'username role');
    res.json(reports);
});

router.patch('/users/:id', verifyAdmin, async (req, res) => {
    const { role, isBanned } = req.body;
    const updates = {};

    if (role) {
        if (!['user', 'editor', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Role tidak valid.' });
        }
        updates.role = role;
    }

    if (typeof isBanned === 'boolean') {
        updates.isBanned = isBanned;
        updates.bannedAt = isBanned ? new Date() : null;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) {
        return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    res.json({ message: 'User berhasil diperbarui.', user });
});

router.post('/scrape-now', verifyAdmin, async (req, res) => {
    const result = await triggerScrape({ startedBy: req.user.id, triggerSource: 'manual' });
    if (!result.accepted) {
        return res.status(409).json({ error: result.reason, jobId: result.jobId });
    }

    res.json({ message: 'Scraping manual berhasil dipicu. Pantau log untuk progress.', jobId: result.jobId });
});

router.get('/logs', verifyAdmin, async (req, res) => {
    const [logs, scrapeState] = await Promise.all([getLogs(), getScrapeStatus()]);
    res.json({ logs, status: scrapeState });
});

router.post('/broadcast', verifyAdmin, async (req, res) => {
    const { title, message, topic } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Pesan broadcast wajib diisi.' });
    }

    const result = await sendBroadcastNotification({
        title: title || 'Pengumuman Smart Groceries',
        body: message,
        topic: topic || 'price_updates',
        sentBy: req.user.id,
    });

    if (!result.success) {
        return res.status(500).json({ error: result.error || 'Gagal mengirim broadcast.' });
    }

    res.json({ message: 'Broadcast berhasil dikirim dan disimpan ke feed.', response: result.response });
});

router.get('/export', verifyAdmin, async (req, res) => {
    const format = (req.query.format || 'json').toLowerCase();
    const prices = await Price.find()
        .sort({ tanggal: -1 })
        .populate('reportedBy', 'username role points')
        .populate('reviewedBy', 'username role');

    const rows = prices.map((price) => ({
        id: price._id.toString(),
        komoditas: price.komoditas,
        harga: price.harga,
        lokasi: price.lokasi,
        sumber: price.sumber,
        tanggal: price.tanggal?.toISOString?.() || price.tanggal,
        moderationStatus: price.moderationStatus,
        verifications: price.verifications,
        catatan: price.catatan || '',
        reportedBy: price.reportedBy?.username || '',
        reviewedBy: price.reviewedBy?.username || '',
        reviewNote: price.reviewNote || '',
    }));

    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="price-export.csv"');
        return res.send(buildCsv(rows));
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json(rows);
});

router.post('/commodities', verifyAdmin, async (req, res) => {
    const newCommodity = new Commodity(req.body);
    await newCommodity.save();
    res.json({ message: 'Master data berhasil ditambahkan' });
});

module.exports = router;
