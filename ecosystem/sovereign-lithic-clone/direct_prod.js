'use strict';
require('dotenv').config();
const https = require('https');

const API_KEY = process.env.LITHIC_API_KEY;
if (!API_KEY || API_KEY.includes("YOUR_ACTUAL")) {
    console.error("❌ ERROR: Please set your valid LIVE_KEY in the script or environment.");
    process.exit(1);
}

const payload = JSON.stringify({
    type: "UNLOCKED",
    spend_limit: 250000,
    spend_limit_duration: "TRANSACTION",
    state: "OPEN",
    memo: "4MIDABLE CURRCEES LLC - Executive Corporate Card"
});

const options = {
    hostname: 'api.lithic.com',
    port: 443,
    path: '/v1/cards',
    method: 'POST',
    headers: {
        'Authorization': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

console.log("💳 Transmitting direct card issuance request to live network switch...");

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(`\nStatus Code: ${res.statusCode}`);
        console.log(`Response Body:\n${data}`);
    });
});

req.on('error', (e) => {
    console.error(`❌ Request Error: ${e.message}`);
});

req.write(payload);
req.end();
