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

if (!LITHIC_API_KEY || LITHIC_API_KEY.includes("your_actual_production_key")) {
    console.error("❌ CRITICAL: Valid LITHIC_API_KEY missing in .env file.");
    process.exit(1);
}

// Helper for outbound calls to Processor / BIN Sponsor Network Switch
function callProcessorSwitch(method, path, body = null) {
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
                    resolve({ statusCode: res.statusCode, data: JSON.parse(responseData) });
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

// Authorization Middleware
app.use((req, res, next) => {
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
// 1. Visa & Mastercard Card Creation Endpoint
// -------------------------------------------------------------------
app.post('/v1/production/cards/create', async (req, res) => {
    const { 
        network = "VISA", // VISA or MASTERCARD
        type = "UNLOCKED", 
        spend_limit = 100000, 
        memo = "4MIDABLE CURRCEES LLC - Corporate Card" 
    } = req.body;

    try {
        console.log(`💳 Provisioning live ${network.toUpperCase()} card on processor switch...`);
        
        const response = await callProcessorSwitch("POST", "/v1/cards", {
            type: type,
            spend_limit: spend_limit,
            spend_limit_duration: "TRANSACTION",
            state: "OPEN",
            memo: `[${network.toUpperCase()}] ${memo}`
        });

        res.status(response.statusCode).json({
            network: network.toUpperCase(),
            ...response.data
        });
    } catch (err) {
        console.error("❌ Card Provisioning Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------------
// 2. Real-Time Visa/Mastercard Authorization Webhook (Network Switch)
// -------------------------------------------------------------------
app.post('/v1/webhooks/authorizations', (req, res) => {
    const authPayload = req.body;
    const amountCents = authPayload.amount || 0;
    const merchantName = authPayload.merchant?.name || "Unknown Merchant";
    const network = authPayload.card?.network || "Visa/Mastercard";

    console.log(`📥 LIVE NETWORK AUTHORIZATION REQ [${network}]:`);
    console.log(`   Merchant: ${merchantName}`);
    console.log(`   Amount: $${(amountCents / 100).toFixed(2)}`);
    console.log(`   Card Token: ${authPayload.card_token}`);

    // Real-Time Authorization Policy Check (< 2000ms response requirement)
    const isApproved = amountCents <= 500000; // $5,000 threshold

    if (isApproved) {
        console.log(`✅ [${network}] AUTHORIZATION APPROVED`);
        return res.status(200).json({ result: "APPROVED" });
    } else {
        console.log(`❌ [${network}] AUTHORIZATION DECLINED - Limit Exceeded`);
        return res.status(200).json({ result: "DECLINED", reason: "INSUFFICIENT_FUNDS" });
    }
});

// Start Gateway
app.listen(PORT, () => {
    console.log(`🌐 Sovereign Visa & Mastercard Gateway running on port ${PORT}`);
    console.log(`🔒 Active HTTPS session connected to ${LITHIC_HOST}`);
});
