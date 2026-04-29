const Commodity = require('../models/Commodity');

/**
 * Normalisasi nama komoditas berdasarkan nama resmi atau alias di database.
 * @param {string} rawName Nama asli dari hasil scraping atau input user
 * @returns {Promise<string>} Nama resmi komoditas
 */
async function normalizeItemName(rawName) {
    if (!rawName) return rawName;
    
    const input = rawName.toLowerCase().trim();
    
    try {
        // Cari komoditas yang nama resminya atau aliasnya cocok dengan input
        const item = await Commodity.findOne({
            $or: [
                { name: new RegExp(`^${input}$`, 'i') },
                { aliases: input }
            ]
        });

        // Jika ditemukan, gunakan nama resmi. Jika tidak, tetap gunakan nama asli (sementara)
        return item ? item.name : rawName;
    } catch (error) {
        console.error('❌ Gagal normalisasi nama:', error.message);
        return rawName;
    }
}

module.exports = { normalizeItemName };
