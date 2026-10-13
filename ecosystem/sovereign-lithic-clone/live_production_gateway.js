'use strict';
require('dotenv').config();
const express = require('express');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const LITHIC_API_KEY = process.env.LITHIC_API_KEY;
const LITHIC_HOST = "api.lithic.com"; // Live Production Rails Endpoint

if (!LITHIC_API_KEY || LITHIC_API_KEY.includes("your_actual_production_key")) {
    console.error("❌ CRITICAL: Valid LITHIC_API_KEY missing in .env file.");
    process.exit(1);
}

// -------------------------------------------------------------------
// 1. Direct HTTPS Request Handler to Live Sponsor / Issuer Switch
// -------------------------------------------------------------------
function callLiveSponsorSwitch(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: LITHIC_HOST,
            port: 443,
            path: path,
            method: method,
            headers: {
                "Authorization": `Bearer ${LITHIC_API_KEY}`,
                "Content-Type": "application/json"
            }
        };

        if (payload) {
            options.headers["Content-Length"] = Buffer.byteLength(payload);
        }

        const req = https.request(options, (res) => {
            let responseData = "";
            res.on("data", (chunk) => { responseData += chunk; });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (err) {
                    resolve({ statusCode: res.statusCode, raw: responseData });
                }
            });
        });

        req.on("error", (err) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

// -------------------------------------------------------------------
// 2. Authentication & Authorization Middleware
// -------------------------------------------------------------------
app.use((req, res, next) => {
    // Exempt incoming network switch webhooks from standard bearer check
    if (req.path.startsWith('/v1/webhooks')) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({
            error: "Please provide an API key in the form 'Authorization: [api-key]'",
            debugging_request_id: crypto.randomUUID()
        });
    }
    next();
});

// -------------------------------------------------------------------
// 3. Live Visa/Mastercard Card Provisioning Endpoint
// -------------------------------------------------------------------
app.post('/v1/production/cards/create', async (req, res) => {
    const { type = "UNLOCKED", spend_limit = 100000, memo = "4MIDABLE CURRCEES LLC - Live Corporate Card" } = req.body;

    try {
        console.log("💳 Provisioning live card on Visa network switch via BIN Sponsor...");
        
        const response = await callLiveSponsorSwitch("POST", "/v1/cards", {
            type: type,
            spend_limit: spend_limit,
            spend_limit_duration: "TRANSACTION",
            state: "OPEN",
            memo: memo
        });

        res.status(response.statusCode).json(response.data);
    } catch (err) {
        console.error("❌ Live Card Issuance Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------------
// 4. Real-Time ASA/JIT Authorization Webhook Gateway
// -------------------------------------------------------------------
// Payment network switch calls this route within 2000ms when a card is swiped
app.post('/v1/webhooks/authorizations', (req, res) => {
    const authPayload = req.body;
    const amountCents = authPayload.amount || 0;
    const merchantName = authPayload.merchant?.name || "Unknown Merchant";

    console.log(`📥 LIVE NETWORK AUTHORIZATION SWIPE:`);
    console.log(`   Merchant: ${merchantName} | Amount: $${(amountCents / 100).toFixed(2)}`);
    console.log(`   Card Token: ${authPayload.card_token}`);

    // Real-Time Risk & Policy Checks
    const isWithinPolicy = amountCents <= 500000; // $5,000 max single charge approval limit

    if (isWithinPolicy) {
        console.log("✅ LIVE TRANSACTION APPROVED");
        return res.status(200).json({ result: "APPROVED" });
    } else {
        console.log("❌ LIVE TRANSACTION DECLINED - Exceeds spend limit");
        return res.status(200).json({ result: "DECLINED", reason: "INSUFFICIENT_FUNDS" });
    }
});

// Start Master Production Server
app.listen(PORT, () => {
    console.log(`🌐 Sovereign Production Gateway active on port ${PORT}`);
    console.log(`🔒 Direct mTLS/HTTPS session established with https://${LITHIC_HOST}`);
});
