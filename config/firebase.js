const admin = require('firebase-admin');

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    try {
        serviceAccount = require('../firebase-auth.json');
    } catch (e) {
        console.error('Firebase service account not found. Please provide FIREBASE_SERVICE_ACCOUNT env var or firebase-auth.json file.');
        throw e;
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;