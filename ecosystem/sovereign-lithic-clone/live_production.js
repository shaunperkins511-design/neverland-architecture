'use strict';
require('dotenv').config();
const express = require('express');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const LITHIC_API_KEY = process.env.LITHIC_API_KEY;
const LITHIC_HOST = "api.lithic.com";

if (!LITHIC_API_KEY || LITHIC_API_KEY.includes("your_live_production")) {
    console.error("❌ CRITICAL: Valid LITHIC_API_KEY missing in .env file.");
    process.exit(1);
}

// -------------------------------------------------------------------
// 1. Live Production Card Provisioning (Direct Network Call)
// -------------------------------------------------------------------
function provisionLiveCard(params) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            type: params.type || "UNLOCKED",
            spend_limit: params.spend_limit || 10000, // Amount in cents ($100.00)
            spend_limit_duration: params.spend_limit_duration || "TRANSACTION",
            state: "OPEN",
            memo: params.memo || "4MIDABLE CURRCEES LLC - Live Card"
        });

        const options = {
            hostname: LITHIC_HOST,
            port: 443,
            path: "/v1/cards",
            method: "POST",
            headers: {
                "Authorization": LITHIC_API_KEY,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on("error", (err) => reject(err));
        req.write(payload);
        req.end();
    });
}

// REST Route to trigger a real card issuing request on live rails
app.post('/v1/production/cards/create', async (req, res) => {
    try {
        console.log("💳 Sending real card issuance request to live network switch...");
        const result = await provisionLiveCard(req.body);
        res.status(result.statusCode).json(result.body);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------------
// 2. Real-Time Network Authorization Webhook (ASA / JIT Gateway)
// -------------------------------------------------------------------
// When a physical/online merchant swipes the card, the network switch calls this endpoint
app.post('/v1/webhooks/authorizations', (req, res) => {
    const authEvent = req.body;
    console.log(`📥 LIVE NETWORK SWIPE RECEIVED from ${authEvent.merchant?.name || 'Merchant'}`);
    console.log(`   Amount: $${(authEvent.amount / 100).toFixed(2)} | Card Token: ${authEvent.card_token}`);

    // Real-Time Authorization Decisioning Logic
    const isApproved = authEvent.amount <= 500000; // Custom authorization threshold check

    if (isApproved) {
        console.log("✅ LIVE AUTHORIZATION APPROVED");
        return res.status(200).json({ result: "APPROVED" });
    } else {
        console.log("❌ LIVE AUTHORIZATION DECLINED");
        return res.status(200).json({ result: "DECLINED" });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Live Production Network Gateway online at http://localhost:${PORT}`);
    console.log(`🔒 Connected to Live Network Host: https://${LITHIC_HOST}`);
});
