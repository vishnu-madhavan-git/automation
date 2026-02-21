
const admin = require('firebase-admin');

/**
 * Service to handle Firebase integration for persistent memory and CRM backup.
 */
class FirebaseService {
    constructor() {
        this.initialized = false;
    }

    init() {
        const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

        if (!credPath) {
            console.warn('[firebase] FIREBASE_SERVICE_ACCOUNT_PATH not set in .env');
            return false;
        }

        try {
            const serviceAccount = require(credPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            this.db = admin.firestore();
            this.initialized = true;
            console.log('[firebase] Admin SDK initialized');
            return true;
        } catch (err) {
            console.error('[firebase] Init error:', err.message);
            return false;
        }
    }

    async saveLead(lead) {
        if (!this.initialized) this.init();
        if (!this.initialized) return;

        try {
            await this.db.collection('leads').add({
                ...lead,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[firebase] Lead saved: ${lead.name}`);
        } catch (err) {
            console.error('[firebase] Save error:', err.message);
        }
    }

    async getGlobalState(key) {
        if (!this.initialized) this.init();
        if (!this.initialized) return null;

        const doc = await this.db.collection('system').doc(key).get();
        return doc.exists ? doc.data() : null;
    }

    async setGlobalState(key, data) {
        if (!this.initialized) this.init();
        if (!this.initialized) return;

        await this.db.collection('system').doc(key).set(data, { merge: true });
    }
}

module.exports = new FirebaseService();
