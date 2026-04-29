const Price = require('../models/Price');

// 1. Endpoint: Ambil harga terbaru untuk semua bahan
const getLatestPrices = async (req, res) => {
    try {
        const prices = await Price.find().sort({ tanggal: -1 }).limit(20);
        res.json(prices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Endpoint: Riwayat harga untuk Grafik
const getHistory = async (req, res) => {
    try {
        const history = await Price.find({
            komoditas: new RegExp(req.params.name, 'i')
        }).sort({ tanggal: 1 });

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Endpoint: Kalkulator Shopping List
const calculateBudget = async (req, res) => {
    const { items } = req.body; // Format: [{ name: "Beras", qty: 2 }]
    let totalEstimasi = 0;
    let rincian = [];

    try {
        for (let item of items) {
            const latestPrice = await Price.findOne({
                komoditas: new RegExp(item.name, 'i')
            }).sort({ tanggal: -1 });

            if (latestPrice) {
                const subTotal = latestPrice.harga * item.qty;
                totalEstimasi += subTotal;
                rincian.push({ name: item.name, hargaSatuan: latestPrice.harga, subTotal });
            }
        }
        res.json({ totalEstimasi, rincian });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getLatestPrices,
    getHistory,
    calculateBudget
};
