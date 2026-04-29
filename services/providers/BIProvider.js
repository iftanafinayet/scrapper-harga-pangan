const BaseProvider = require('./BaseProvider');

class BIProvider extends BaseProvider {
    constructor() {
        super('Bank Indonesia');
        this.url = 'https://www.bi.go.id/hargapangan';
    }

    async setup(page) {
        await page.goto(this.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('table', { timeout: 30000 });
    }

    async scrape(page) {
        const data = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            const results = [];

            rows.forEach((row, index) => {
                if (index === 0) return;

                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const komoditas = cells[0].innerText.trim();
                    const hargaRaw = cells[cells.length - 1].innerText.trim();

                    if (komoditas && hargaRaw) {
                        const harga = parseInt(hargaRaw.replace(/[^0-9]/g, ''), 10);
                        if (!Number.isNaN(harga)) {
                            results.push({
                                komoditas,
                                harga,
                                lokasi: 'Pusat (Bank Indonesia)',
                                koordinat: {
                                    type: 'Point',
                                    coordinates: [106.8271, -6.1751],
                                },
                                tanggal: new Date().toISOString(),
                            });
                        }
                    }
                }
            });
            return results;
        });

        return data;
    }
}

module.exports = new BIProvider();
