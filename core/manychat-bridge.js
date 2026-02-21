const http = require("http");
const https = require("https");
require("dotenv").config();

const MC_TOKEN = process.env.MANYCHAT_API_KEY || "";

/**
 * ManyChat API Bridge
 * Documentation: https://api.manychat.com/swagger
 */
async function mcPost(path, data) {
    if (!MC_TOKEN) throw new Error("MANYCHAT_API_KEY not set");

    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            hostname: "api.manychat.com",
            path: `/fb/${path}`, // ManyChat v1 uses /fb prefix for many endpoints
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MC_TOKEN}`,
                "Content-Length": Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let resp = "";
            res.on("data", c => resp += c);
            res.on("end", () => {
                try { resolve(JSON.parse(resp)); }
                catch { resolve(resp); }
            });
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

/**
 * Trigger a ManyChat Flow for a subscriber
 */
async function triggerFlow(subscriberId, flowName) {
    // mapping flows to IDs would be needed here or pass ID directly
    return mcPost("sending/sendFlow", {
        subscriber_id: subscriberId,
        flow_ns: flowName
    });
}

module.exports = { mcPost, triggerFlow };
