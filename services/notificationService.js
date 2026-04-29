const admin = require('../config/firebase');
const Notification = require('../models/Notification');

async function sendNotification(message) {
    try {
        const response = await admin.messaging().send(message);
        return { success: true, response };
    } catch (error) {
        console.error('❌ Gagal mengirim notifikasi:', error.message);
        return { success: false, error: error.message };
    }
}

async function persistNotification({ title, body, sentBy = null, targetUser = null, topic = 'price_updates', firebaseResponse = '', metadata = {} }) {
    const notification = new Notification({
        title,
        body,
        sentBy,
        targetUser,
        topic,
        firebaseResponse,
        metadata,
    });
    await notification.save();
    return notification;
}

async function sendPriceAlert(itemName, price) {
    const title = `Update Harga: ${itemName}`;
    const body = `Harga terbaru hari ini Rp${price.toLocaleString('id-ID')}. Cek detailnya sekarang!`;
    const message = {
        notification: { title, body },
        topic: 'price_updates',
    };

    const result = await sendNotification(message);
    if (result.success) {
        await persistNotification({ title, body, topic: 'price_updates', firebaseResponse: result.response, metadata: { type: 'price_alert', itemName, price } });
    }
    return result;
}

async function sendBroadcastNotification({ title, body, topic = 'price_updates', sentBy = null }) {
    const message = {
        notification: { title, body },
        topic,
    };

    const result = await sendNotification(message);
    if (result.success) {
        await persistNotification({ title, body, sentBy, topic, firebaseResponse: result.response, metadata: { type: 'broadcast' } });
    }
    return result;
}

async function createUserNotification({ title, body, targetUser, sentBy = null, metadata = {} }) {
    return persistNotification({ title, body, sentBy, targetUser, topic: 'user_updates', metadata });
}

async function notifyScrapeFailure(jobId, error) {
    const title = '⚠️ Scraper Failure';
    const body = `Job ${jobId} gagal: ${error}. Segera periksa log sistem.`;
    const message = {
        notification: { title, body },
        topic: 'admin_alerts',
    };

    const result = await sendNotification(message);
    if (result.success) {
        await persistNotification({ title, body, topic: 'admin_alerts', firebaseResponse: result.response, metadata: { type: 'scrape_failure', jobId } });
    }
    return result;
}

async function sendScrapeSummary(summary) {
    const title = '✅ Scrape Completed';
    const body = `Update harga selesai. ${summary.total} komoditas diperbarui dari ${summary.providers} sumber.`;
    const message = {
        notification: { title, body },
        topic: 'admin_alerts',
    };

    const result = await sendNotification(message);
    if (result.success) {
        await persistNotification({ title, body, topic: 'admin_alerts', firebaseResponse: result.response, metadata: { type: 'scrape_summary', ...summary } });
    }
    return result;
}

module.exports = { sendPriceAlert, sendBroadcastNotification, createUserNotification, notifyScrapeFailure, sendScrapeSummary };
