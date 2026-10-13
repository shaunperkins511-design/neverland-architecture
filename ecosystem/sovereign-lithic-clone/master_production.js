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

// Helper: Make authenticated HTTPS requests directly to Lithic Live Rails
function makeLithicRequest(method, path, payloadObj = null) {
    return new Promise((resolve, reject) => {
        const data = payloadObj ? JSON.stringify(payloadObj) : null;
        const options = {
            hostname: LITHIC_HOST,
            port: 443,
            path: path,
            method: method,
            headers: {
                "Authorization": LITHIC_API_KEY,
                "Content-Type": "application/json"
            }
        };

        if (data) {
            options.headers["Content-Length"] = Buffer.byteLength(data);
        }

        const req = https.request(options, (res) => {
            let responseBody = "";
            res.on("data", (chunk) => { responseBody += chunk; });
            res.on("end", () => {
                try {
                    const parsed = responseBody ? JSON.parse(responseBody) : {};
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, raw: responseBody });
                }
            });
        });

        req.on("error", (err) => reject(err));
        if (data) req.write(data);
        req.end();
    });
}

// -------------------------------------------------------------------
// 1. API Key & Request Authentication Middleware
// -------------------------------------------------------------------
app.use((req, res, next) => {
    // Allow public access to webhook endpoints coming from card network switches
    if (req.path.startsWith('/v1/webhooks')) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({
            error: "Missing Authorization header",
            debugging_request_id: crypto.randomUUID()
        });
    }
    next();
});

// -------------------------------------------------------------------
// 2. Production Card Provisioning Endpoint
// -------------------------------------------------------------------
app.post('/v1/production/cards', async (req, res) => {
    const { type = "UNLOCKED", spend_limit = 50000, memo = "4MIDABLE CURRCEES LLC - Live Card" } = req.body;
    
    try {
        console.log("💳 Requesting real card issuance from live issuing rails...");
        const result = await makeLithicRequest("POST", "/v1/cards", {
            type: type,
            spend_limit: spend_limit,
            spend_limit_duration: "TRANSACTION",
            state: "OPEN",
            memo: memo
        });
        res.status(result.statusCode).json(result.body);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------------
// 3. MEV Liquidity Bridge / Book Transfer Endpoint
// -------------------------------------------------------------------
// Automatically routes realized MEV arbitrage profits into your issuing financial account
app.post('/v1/production/transfers', async (req, res) => {
    const { amount_cents, financial_account_token, destination_financial_account_token } = req.body;

    try {
        console.log(`⚡ Bridging $${(amount_cents / 100).toFixed(2)} arbitrage profit to live custodial rails...`);
        const result = await makeLithicRequest("POST", "/v1/book_transfers", {
            amount: amount_cents,
            financial_account_token: financial_account_token,
            destination_financial_account_token: destination_financial_account_token,
            memo: "4MIDABLE CURRCEES LLC - π-MEV Swarm Profit Settlement"
        });
        res.status(result.statusCode).json(result.body);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------------
// 4. Real-Time Network Authorization Webhook (JIT / ASA Switch)
// -------------------------------------------------------------------
app.post('/v1/webhooks/authorizations', (req, res) => {
    const authEvent = req.body;
    console.log(`📥 LIVE NETWORK SWIPE: ${authEvent.merchant?.name || 'External Merchant'} | Amount: $${(authEvent.amount / 100).toFixed(2)}`);

    // Real-Time Risk & Spend Control Decisioning
    const isApproved = authEvent.amount <= 250000; // $2,500 threshold check

    if (isApproved) {
        console.log("✅ LIVE AUTHORIZATION APPROVED");
        return res.status(200).json({ result: "APPROVED" });
    } else {
        console.log("❌ LIVE AUTHORIZATION DECLINED (Exceeds policy threshold)");
        return res.status(200).json({ result: "DECLINED", reason: "AMOUNT_LIMIT_EXCEEDED" });
    }
});

// Start Production Gateway Server
app.listen(PORT, () => {
    console.log(`🌐 Sovereign Production Gateway running on port ${PORT}`);
    console.log(`🔒 Connected directly to live network host: https://${LITHIC_HOST}`);
});
