const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const Price = require('../models/Price');
const ScrapeJob = require('../models/ScrapeJob');
const { sendPriceAlert, notifyScrapeFailure, sendScrapeSummary } = require('./notificationService');
const { normalizeItemName } = require('./commodityService');
const biProvider = require('./providers/BIProvider');

puppeteer.use(StealthPlugin());

const ACTIVE_PROVIDERS = [biProvider];


let currentJobId = null;
let isScraping = false;

async function withRetry(fn, retries = 3, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`⚠️ Attempt ${i + 1} failed: ${error.message}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function appendLog(jobId, message) {
    const entry = { message, createdAt: new Date() };
    console.log(`[${entry.createdAt.toISOString()}] ${message}`);

    if (!jobId) {
        return;
    }

    await ScrapeJob.findByIdAndUpdate(jobId, {
        $push: {
            logs: {
                $each: [entry],
                $slice: -200,
            },
        },
    });
}

async function markStaleRunningJobs() {
    await ScrapeJob.updateMany(
        { status: 'running' },
        {
            $set: {
                status: 'interrupted',
                finishedAt: new Date(),
                errorMessage: 'Server restarted before scrape completed.',
            },
            $push: {
                logs: {
                    message: 'Scrape job marked interrupted after server restart.',
                    createdAt: new Date(),
                },
            },
        },
    );
}

async function getLogs() {
    const latestJob = await ScrapeJob.findOne().sort({ startedAt: -1 }).lean();
    return latestJob ? latestJob.logs || [] : [];
}

async function getScrapeStatus() {
    const latestJob = await ScrapeJob.findOne().sort({ startedAt: -1 }).lean();
    return {
        isScraping,
        currentJobId,
        latestJob,
    };
}

async function triggerScrape({ startedBy = null, triggerSource = 'manual' } = {}) {
    if (isScraping) {
        return {
            accepted: false,
            reason: 'Scraping sedang berjalan. Tunggu proses aktif selesai.',
            jobId: currentJobId,
        };
    }

    const job = await ScrapeJob.create({
        triggerSource,
        startedBy,
        status: 'running',
        startedAt: new Date(),
        logs: [{ message: `Scrape triggered via ${triggerSource}.`, createdAt: new Date() }],
    });

    currentJobId = job._id.toString();
    isScraping = true;

    const runPromise = scrapeHargaPangan(job._id);
    runPromise.finally(() => {
        currentJobId = null;
        isScraping = false;
    });

    return {
        accepted: true,
        reason: 'Scrape dimulai.',
        jobId: job._id.toString(),
    };
}

async function scrapeHargaPangan(jobId = null) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ],
        });

        const allFormattedData = [];

        for (const provider of ACTIVE_PROVIDERS) {
            await appendLog(jobId, `🚀 Starting provider: ${provider.name}`);
            const page = await browser.newPage();
            
            try {
                const userAgent = new UserAgent().toString();
                await page.setUserAgent(userAgent);

                await withRetry(async () => {
                    await provider.setup(page);
                });

                const rawData = await provider.scrape(page);
                
                if (!rawData || rawData.length === 0) {
                    await appendLog(jobId, `⚠️ No data found from ${provider.name}`);
                    continue;
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const bulkOps = [];
                const providerFormatted = [];

                for (const item of rawData) {
                    const normalizedName = await normalizeItemName(item.komoditas);
                    
                    if (item.harga <= 0) {
                        await appendLog(jobId, `⚠️ Invalid data from ${provider.name}: ${item.komoditas} - ${item.harga}`);
                        continue;
                    }

                    const doc = {
                        komoditas: normalizedName,
                        harga: item.harga,
                        lokasi: item.lokasi,
                        koordinat: item.koordinat,
                        tanggal: today,
                        sumber: 'official',
                        moderationStatus: 'approved',
                    };

                    providerFormatted.push(doc);

                    bulkOps.push({
                        updateOne: {
                            filter: { 
                                komoditas: doc.komoditas, 
                                lokasi: doc.lokasi, 
                                tanggal: doc.tanggal 
                            },
                            update: { $set: doc },
                            upsert: true
                        }
                    });
                }

                if (bulkOps.length > 0) {
                    await Price.bulkWrite(bulkOps);
                    await appendLog(jobId, `✅ ${provider.name} successfully stored: ${bulkOps.length} records`);
                }

                allFormattedData.push(...providerFormatted);
                await page.close();
            } catch (providerError) {
                await appendLog(jobId, `❌ Error in ${provider.name}: ${providerError.message}`);
                if (page) await page.close();
            }
        }

        if (allFormattedData.length === 0) {
            if (jobId) {
                await ScrapeJob.findByIdAndUpdate(jobId, {
                    $set: { status: 'failed', finishedAt: new Date(), errorMessage: 'No data collected from any provider.' },
                });
            }
            return [];
        }

        // Alert for the first item of the first provider as a sample
        const bestItem = allFormattedData[0];
        await sendPriceAlert(bestItem.komoditas, bestItem.harga);
        await appendLog(jobId, `🔔 Notification sent for ${bestItem.komoditas}.`);

        if (jobId) {
            await ScrapeJob.findByIdAndUpdate(jobId, {
                $set: {
                    status: 'success',
                    finishedAt: new Date(),
                    insertedCount: allFormattedData.length,
                    errorMessage: '',
                },
            });
            
            await sendScrapeSummary({
                total: allFormattedData.length,
                providers: ACTIVE_PROVIDERS.length
            });
        }

        return allFormattedData;
    } catch (error) {
        await appendLog(jobId, `❌ Global failure: ${error.message}`);
        if (jobId) {
            await ScrapeJob.findByIdAndUpdate(jobId, {
                $set: {
                    status: 'failed',
                    finishedAt: new Date(),
                    errorMessage: error.message,
                },
            });
            
            await notifyScrapeFailure(jobId, error.message);
        }
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeHargaPangan, triggerScrape, getLogs, getScrapeStatus, markStaleRunningJobs };


