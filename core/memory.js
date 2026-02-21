
const http = require('http');

/**
 * Service to handle local vector embeddings and RAG (Retrieval Augmented Generation).
 * Uses Ollama with nomic-embed-text.
 */
class MemoryService {
    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.model = 'nomic-embed-text';
        this.vectors = []; // In-memory vector store: { text, embedding, metadata }
    }

    async getEmbedding(text) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({ model: this.model, prompt: text });
            const url = new URL(`${this.ollamaUrl}/api/embeddings`);

            const req = http.request({
                hostname: url.hostname,
                port: url.port || 11434,
                path: '/api/embeddings',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (res) => {
                let resp = '';
                res.on('data', c => resp += c);
                res.on('end', () => {
                    try {
                        const data = JSON.parse(resp);
                        resolve(data.embedding);
                    } catch (err) {
                        reject(new Error('Failed to parse embedding response'));
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    /**
     * Simple cosine similarity
     */
    cosineSimilarity(v1, v2) {
        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;
        for (let i = 0; i < v1.length; i++) {
            dotProduct += v1[i] * v2[i];
            mag1 += v1[i] * v1[i];
            mag2 += v2[i] * v2[i];
        }
        return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }

    async indexText(text, metadata = {}) {
        try {
            const embedding = await this.getEmbedding(text);
            this.vectors.push({ text, embedding, metadata });
            console.log(`[memory] Indexed: ${text.slice(0, 30)}...`);
        } catch (err) {
            console.error('[memory] Indexing error:', err.message);
        }
    }

    async search(query, limit = 3) {
        if (this.vectors.length === 0) return [];

        try {
            const queryEmbedding = await this.getEmbedding(query);
            const results = this.vectors
                .map(v => ({
                    ...v,
                    score: this.cosineSimilarity(queryEmbedding, v.embedding)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);

            return results;
        } catch (err) {
            console.error('[memory] Search error:', err.message);
            return [];
        }
    }

    /**
     * Sync leads into the vector memory
     */
    async syncLeads(leads) {
        console.log(`[memory] Syncing ${leads.length} leads into vector space...`);
        this.vectors = []; // Reset for simple sync
        for (const lead of leads) {
            const text = `Lead: ${lead.name}, Phone: ${lead.phone}, Status: ${lead.status}, Notes: ${lead.notes || 'none'}`;
            await this.indexText(text, { type: 'lead', name: lead.name });
        }
    }
}

module.exports = new MemoryService();
