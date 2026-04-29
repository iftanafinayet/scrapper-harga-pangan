const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Price = require('./models/Price');
const Commodity = require('./models/Commodity');

dotenv.config();

const STAPLE_FOODS = [
  { name: 'Beras', unit: 'kg', basePrice: 12000, volatility: 0.1, icon: 'rice_bowl', tone: 'positive', category: 'Beras' },
  { name: 'Gula Pasir', unit: 'kg', basePrice: 14000, volatility: 0.1, icon: 'cookie', tone: 'neutral', category: 'Gula Pasir' },
  { name: 'Minyak Goreng & Mentega', unit: 'Liter', basePrice: 15500, volatility: 0.08, icon: 'water_drop', tone: 'warning', category: 'Minyak Goreng & Mentega' },
  { name: 'Daging Sapi & Daging Ayam', unit: 'kg', basePrice: 95000, volatility: 0.2, icon: 'set_meal', tone: 'danger', category: 'Daging Sapi & Daging Ayam' },
  { name: 'Telur Ayam', unit: 'kg', basePrice: 26000, volatility: 0.2, icon: 'egg', tone: 'neutral', category: 'Telur Ayam' },
  { name: 'Susu', unit: 'Liter', basePrice: 18000, volatility: 0.1, icon: 'glass_cup', tone: 'neutral', category: 'Susu' },
  { name: 'Jagung', unit: 'kg', basePrice: 8000, volatility: 0.15, icon: 'grass', tone: 'neutral', category: 'Jagung' },
  { name: 'Minyak Tanah atau Gas ELPIJI', unit: 'Tabung', basePrice: 22000, volatility: 0.05, icon: 'propane_tank', tone: 'neutral', category: 'Minyak Tanah atau Gas ELPIJI' },
  { name: 'Garam Beriodium', unit: 'kg', basePrice: 5000, volatility: 0.05, icon: 'scatter_plot', tone: 'neutral', category: 'Garam Beriodium' },
];

const PROVINCES = [
  'DKI Jakarta', 'Jawa Barat', 'Jawa Timur', 'Jawa Tengah', 'Bali', 'Banten'
];

const CITY_MAP = {
  'DKI Jakarta': ['Jakarta Pusat', 'Jakarta Utara', 'Jakarta Timur', 'Jakarta Selatan', 'Jakarta Barat'],
  'Jawa Barat': ['Bandung', 'Bekasi', 'Depok', 'Bogor', 'Cirebon'],
  'Jawa Timur': ['Surabaya', 'Malang', 'Kediri', 'Madiun', 'Banyuwangi'],
  'Jawa Tengah': ['Semarang', 'Solo', 'Magelang', 'Tegal', 'Pekalongan'],
  'Bali': ['Denpasar', 'Badung', 'Gianyar', 'Klungkung'],
  'Banten': ['Serang', 'Tangerang', 'Cilegon', 'Tangsel'],
};

async function seed() {
  console.log('🚀 Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected.');

    console.log('🧹 Cleaning existing prices...');
    // We clear all prices to ensure only the official 9 are shown
    await Price.deleteMany({});

    console.log('📦 Ensuring commodities metadata...');
    // Clear old commodities to ensure categories match the new enum
    await Commodity.deleteMany({});
    
    for (const food of STAPLE_FOODS) {
      await Commodity.create({ 
        name: food.name,
        unit: food.unit, 
        icon: food.icon, 
        category: food.category 
      });
    }

    const reports = [];
    
    for (const food of STAPLE_FOODS) {
      for (const province of PROVINCES) {
        const cities = CITY_MAP[province] || ['Umum'];
        for (const city of cities) {
          for (let d = 0; d < 10; d++) {
            const date = new Date();
            date.setDate(date.getDate() - d * 3);
            
            const price = food.basePrice * (1 + (Math.random() * 2 - 1) * food.volatility);
            
            reports.push({
              komoditas: food.name,
              lokasi: `${city}, ${province}`,
              harga: Math.round(price / 50) * 50,
              tanggal: date,
              sumber: 'official',
              verifications: Math.floor(Math.random() * 50),
              koordinat: {
                type: 'Point',
                coordinates: [
                  106 + (Math.random() * 2),
                  -6 + (Math.random() * 2),
                ]
              },
              moderationStatus: 'approved'
            });
          }
        }
      }
    }

    console.log(`📡 Inserting ${reports.length} reports...`);
    await Price.insertMany(reports);
    
    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
