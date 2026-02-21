
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

/**
 * Service to handle Google Sheets integration for IX Ruby CRM.
 */
class SheetsService {
    constructor() {
        this.sheetId = process.env.GOOGLE_SHEET_ID;
        this.email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        this.key = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
        this.doc = null;
    }

    async init() {
        if (!this.sheetId || !this.email || !this.key) {
            console.warn('[sheets] Missing credentials in .env (GOOGLE_SHEET_ID, etc.)');
            return false;
        }

        try {
            const auth = new JWT({
                email: this.email,
                key: this.key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            this.doc = new GoogleSpreadsheet(this.sheetId, auth);
            await this.doc.loadInfo();
            console.log(`[sheets] Connected to: ${this.doc.title}`);
            return true;
        } catch (err) {
            console.error('[sheets] Init error:', err.message);
            return false;
        }
    }

    /**
     * Add a new lead to the first sheet.
     * Expected columns: Date, Name, Phone, Status, Notes
     */
    async addLead(lead) {
        if (!this.doc) await this.init();
        if (!this.doc) throw new Error('Sheets not initialized');

        const sheet = this.doc.sheetsByIndex[0];
        await sheet.addRow({
            Date: new Date().toISOString(),
            Name: lead.name,
            Phone: lead.phone,
            Status: 'New',
            Notes: lead.notes || ''
        });
        console.log(`[sheets] Lead added: ${lead.name}`);
    }

    async getLeads() {
        if (!this.doc) await this.init();
        if (!this.doc) return [];

        const sheet = this.doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        return rows.map(r => ({
            date: r.get('Date'),
            name: r.get('Name'),
            phone: r.get('Phone'),
            status: r.get('Status'),
            notes: r.get('Notes')
        }));
    }
}

module.exports = new SheetsService();
