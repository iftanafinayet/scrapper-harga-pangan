require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const priceRoutes = require('./routes/priceRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { initCronJobs } = require('./services/cronService');
const { markStaleRunningJobs } = require('./services/scraperService');

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/admin', adminRoutes);

async function bootstrap() {
    await connectDB();
    await markStaleRunningJobs();
    initCronJobs();

    const port = process.env.PORT || 10000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
    });
}

bootstrap().catch((error) => {
    console.error('❌ Gagal menjalankan server:', error.message);
    process.exit(1);
});
