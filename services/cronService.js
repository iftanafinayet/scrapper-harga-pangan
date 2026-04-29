const cron = require('node-cron');
const { triggerScrape } = require('./scraperService');

const initCronJobs = () => {
    console.log('⏰ Penjadwal Otomatis Aktif (Update setiap jam 6 pagi)');

    cron.schedule('0 6 * * *', async () => {
        console.log('🚀 Menjalankan scraper otomatis pada jam 06:00 pagi...');
        try {
            const result = await triggerScrape({ triggerSource: 'cron' });
            if (!result.accepted) {
                console.log(`ℹ️ Cron scrape dilewati: ${result.reason}`);
                return;
            }
            console.log('✅ Update otomatis berhasil dipicu.');
        } catch (error) {
            console.error('❌ Gagal menjalankan update otomatis:', error.message);
        }
    });
};

module.exports = { initCronJobs };
