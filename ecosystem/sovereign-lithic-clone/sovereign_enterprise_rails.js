'use strict';
require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const ENTITY_NAME = process.env.ENTITY_NAME || "4MIDABLE CURRCEES LLC";
const LITHIC_API_KEY = process.env.LITHIC_API_KEY || "your_actual_production_key";

// Outbound Call Handler to BIN Sponsor Issuer Switch
function callIssuerSwitch(method, pathUrl, payload = null, clientApiKey = null) {
    return new Promise((resolve, reject) => {
        const requestData = payload ? JSON.stringify(payload) : null;
        // Use client provided API key or fallback to environment variable
        const activeApiKey = clientApiKey || LITHIC_API_KEY;

        const options = {
            hostname: 'api.lithic.com',
            port: 443,
            path: pathUrl,
            method: method,
            headers: {
                "Authorization": activeApiKey, // Raw API key string required by Lithic
                "Content-Type": "application/json"
            }
        };

        if (requestData) {
            options.headers['Content-Length'] = Buffer.byteLength(requestData);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', err => reject(err));
        if (requestData) req.write(requestData);
        req.end();
    });
}

// Internal Gateway Middleware
app.use((req, res, next) => {
    if (req.path.startsWith('/v1/webhooks')) return next();
    
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({
            message: "Please provide an API key in the form 'Authorization: [api-key]'",
            debugging_request_id: crypto.randomUUID()
        });
    }
    req.apiKey = authHeader;
    next();
});

// -------------------------------------------------------------------
// ENTERPRISE GATEWAY REST ENDPOINTS
// -------------------------------------------------------------------

// Provision Visa Corporate Card via Live Rails
app.post('/v1/enterprise/visa/cards', async (req, res) => {
    const { spend_limit = 250000, memo = `${ENTITY_NAME} - Executive Visa Card` } = req.body;
    try {
        console.log(`💳 Routing Visa Card Issuance Request through BIN Sponsor Switch...`);
        const result = await callIssuerSwitch('POST', '/v1/cards', {
            type: "UNLOCKED",
            spend_limit: spend_limit,
            spend_limit_duration: "TRANSACTION",
            state: "OPEN",
            memo: `[VISA] ${memo}`
        }, req.apiKey);

        res.status(result.statusCode).json({ network: "VISA_NETWORK", ...result.data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Provision Mastercard Corporate Card via Live Rails
app.post('/v1/enterprise/mastercard/cards', async (req, res) => {
    const { spend_limit = 250000, memo = `${ENTITY_NAME} - Executive Mastercard` } = req.body;
    try {
        console.log(`💳 Routing Mastercard Issuance Request through BIN Sponsor Switch...`);
        const result = await callIssuerSwitch('POST', '/v1/cards', {
            type: "UNLOCKED",
            spend_limit: spend_limit,
            spend_limit_duration: "TRANSACTION",
            state: "OPEN",
            memo: `[MASTERCARD] ${memo}`
        }, req.apiKey);

        res.status(result.statusCode).json({ network: "MASTERCARD_NETWORK", ...result.data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Real-Time ASA/JIT Network Switch Webhook Listener
app.post('/v1/webhooks/authorizations', (req, res) => {
    const authPayload = req.body;
    console.log(`📥 [NETWORK SWITCH JIT AUTH] Merchant: ${authPayload.merchant?.name || 'POS'} | Amount: $${((authPayload.amount || 0) / 100).toFixed(2)}`);

    return res.status(200).json({ result: "APPROVED", entity: ENTITY_NAME });
});

// Start Express Server
app.listen(PORT, () => {
    console.log(`🚀 Sovereign Enterprise Rails online for ${ENTITY_NAME}`);
});
