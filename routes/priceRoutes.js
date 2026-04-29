const express = require('express');
const router = express.Router();
const Price = require('../models/Price');
const Commodity = require('../models/Commodity');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/authMiddleware');
const { createUserNotification } = require('../services/notificationService');
const { normalizeItemName } = require('../services/commodityService');

router.post('/report', verifyToken, async (req, res) => {
    const {
        komoditas,
        harga,
        lokasi,
        lat,
        lng,
        provinsi,
        kota,
        catatan,
    } = req.body;

    try {
        const normalizedCommodityInput = String(komoditas || '').trim();
        const normalizedLocation = String(lokasi || '').trim() || [String(kota || '').trim(), String(provinsi || '').trim()]
            .filter(Boolean)
            .join(', ');
        const normalizedNote = String(catatan || '').trim();
        const numericPrice = Number(harga);
        const latitude = Number(lat);
        const longitude = Number(lng);

        if (!normalizedCommodityInput) {
            return res.status(400).json({ error: 'Komoditas wajib diisi.' });
        }

        if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
            return res.status(400).json({ error: 'Harga harus berupa angka yang valid.' });
        }

        if (!normalizedLocation) {
            return res.status(400).json({ error: 'Lokasi wajib diisi.' });
        }

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return res.status(400).json({ error: 'Koordinat lokasi wajib diisi dengan lat/lng yang valid.' });
        }

        const officialName = await normalizeItemName(normalizedCommodityInput);

        const newReport = new Price({
            komoditas: officialName,
            harga: numericPrice,
            lokasi: normalizedLocation,
            catatan: normalizedNote,
            koordinat: {
                type: 'Point',
                coordinates: [longitude, latitude],
            },
            sumber: 'user',
            moderationStatus: 'pending',
            reportedBy: req.user.id,
        });

        await newReport.save();
        await createUserNotification({
            title: 'Laporan diterima',
            body: `Laporan ${officialName} di ${normalizedLocation} sudah diterima dan sedang menunggu moderasi admin.`,
            targetUser: req.user.id,
            metadata: {
                type: 'submission_received',
                reportId: newReport._id.toString(),
                moderationStatus: newReport.moderationStatus,
            },
        });

        res.status(201).json({
            message: 'Laporan harga berhasil disimpan dan menunggu moderasi admin!',
            reportId: newReport._id,
            moderationStatus: newReport.moderationStatus,
            report: newReport,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/verify', verifyToken, async (req, res) => {
    const { priceId } = req.body;

    try {
        const price = await Price.findById(priceId);
        if (!price) {
            return res.status(404).json({ error: 'Harga tidak ditemukan' });
        }

        if (price.sumber === 'user' && price.moderationStatus !== 'approved') {
            return res.status(400).json({ error: 'Harga user harus di-approve admin sebelum bisa diverifikasi.' });
        }

        price.verifications += 1;
        await price.save();
        await User.findByIdAndUpdate(req.user.id, { $inc: { points: 5 } });

        res.status(200).json({ message: 'Harga berhasil diverifikasi!', pointsEarned: 5 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/latest', async (req, res) => {
    try {
        const { komoditas, lat, lng, radius } = req.query;

        const query = {
            $or: [
                { sumber: 'official' },
                { sumber: 'user', moderationStatus: 'approved' },
            ],
        };

        if (komoditas) {
            query.komoditas = komoditas;
        }

        if (lat && lng && radius) {
            query.koordinat = {
                $near: {
                    $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
                    $maxDistance: parseFloat(radius),
                },
            };
        }

        const prices = await Price.find(query)
            .sort({ tanggal: -1 })
            .limit(1000)
            .populate('reportedBy', 'username points')
            .populate('reviewedBy', 'username role');

        res.status(200).json(prices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/master-list', async (req, res) => {
    try {
        const list = await Commodity.find().sort({ name: 1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/my-reports', verifyToken, async (req, res) => {
    try {
        const reports = await Price.find({ reportedBy: req.user.id, sumber: 'user' })
            .sort({ tanggal: -1 })
            .limit(30)
            .populate('reviewedBy', 'username role');

        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/notifications', verifyToken, async (req, res) => {
    try {
        const list = await Notification.find({
            $or: [
                { targetUser: null },
                { targetUser: req.user.id },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

        const mapped = list.map((item) => ({
            ...item,
            isRead: item.readBy?.some((entry) => String(entry.user) === req.user.id) || false,
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/notifications/read-all', verifyToken, async (req, res) => {
    try {
        const notifications = await Notification.find({
            $or: [
                { targetUser: null },
                { targetUser: req.user.id },
            ],
            'readBy.user': { $ne: req.user.id },
        });

        await Promise.all(notifications.map((notification) => {
            notification.readBy.push({ user: req.user.id, readAt: new Date() });
            return notification.save();
        }));

        res.json({ message: 'Semua notifikasi ditandai sudah dibaca.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/notifications/:id/read', verifyToken, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });
        }

        const allowed = !notification.targetUser || String(notification.targetUser) === req.user.id;
        if (!allowed) {
            return res.status(403).json({ error: 'Anda tidak berhak membaca notifikasi ini.' });
        }

        const alreadyRead = notification.readBy.some((entry) => String(entry.user) === req.user.id);
        if (!alreadyRead) {
            notification.readBy.push({ user: req.user.id, readAt: new Date() });
            await notification.save();
        }

        res.json({ message: 'Notifikasi ditandai sudah dibaca.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
