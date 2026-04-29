const mongoose = require('mongoose');

const commoditySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Nama resmi: "Cabai Rawit Merah"
    aliases: [String], // Nama lain: ["cabe rawit", "lombok galak"]
    category: { 
        type: String, 
        enum: [
            'Beras', 
            'Gula Pasir', 
            'Minyak Goreng & Mentega', 
            'Daging Sapi & Daging Ayam', 
            'Telur Ayam', 
            'Susu', 
            'Jagung', 
            'Minyak Tanah atau Gas ELPIJI', 
            'Garam Beriodium'
        ],
        required: true 
    },
    unit: { type: String, default: 'kg' }, // kg, liter, per butir
    icon: String // URL untuk icon di aplikasi Flutter nanti
});

module.exports = mongoose.model('Commodity', commoditySchema);