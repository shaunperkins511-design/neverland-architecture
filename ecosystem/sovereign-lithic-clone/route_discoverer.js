'use strict';
require('dotenv').config();
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LIVE_HOST = "api.mastercard.com";
const CANDIDATE_PATHS = [
    "/cards",
    "/processing/v1/cards",
    "/issuer/v1/cards",
    "/core/v1/cards",
    "/global-processing/v1/cards",
    "/mastercard-processing/v1/cards",
    "/digital/cards"
];

function getSigningKey() {
    const keyPath = path.join(__dirname, 'certs/mastercard_private.key');
    if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    return privateKey.export({ type: 'pkcs8', format: 'pem' });
}

function generateMastercardAuthHeader(method, url, payload, consumerKey, privateKeyPem) {
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const bodyString = payload ? JSON.stringify(payload) : '';
    const bodyHash = crypto.createHash('sha256').update(bodyString, 'utf8').digest('base64');

    const oauthParams = {
        oauth_consumer_key: consumerKey || "4MIDABLE_DISCOVERY_KEY",
        oauth_nonce: nonce,
        oauth_signature_method: 'RSA-SHA256',
        oauth_timestamp: timestamp,
        oauth_version: '1.0',
        oauth_body_hash: bodyHash
    };

    const sortedParams = Object.keys(oauthParams).sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
        .join('&');

    const signatureBase = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(sortedParams)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureBase, 'utf8');
    const signature = signer.sign(privateKeyPem, 'base64');

    oauthParams.oauth_signature = signature;
    const headerParts = Object.keys(oauthParams).map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`);
    return `OAuth ${headerParts.join(', ')}`;
}

async function probeRoute(endpointPath) {
    return new Promise((resolve) => {
        const payload = { entity: "4MIDABLE CURRCEES LLC", test_probe: true };
        const requestBody = JSON.stringify(payload);
        const targetUrl = `https://${LIVE_HOST}${endpointPath}`;
        const privateKeyPem = getSigningKey();
        const consumerKey = process.env.MC_PRODUCTION_CONSUMER_KEY;

        const authHeader = generateMastercardAuthHeader("POST", targetUrl, payload, consumerKey, privateKeyPem);

        const options = {
            hostname: LIVE_HOST,
            port: 443,
            path: endpointPath,
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": authHeader,
                "Content-Length": Buffer.byteLength(requestBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ path: endpointPath, status: res.statusCode, response: data });
            });
        });

        req.on('error', () => resolve({ path: endpointPath, status: 520, response: "NETWORK_ERROR" }));
        req.write(requestBody);
        req.end();
    });
}

async function runDiscovery() {
    console.log("🔍 Initializing cryptographic endpoint discovery sweep across Mastercard gateway...");
    for (const p of CANDIDATE_PATHS) {
        const result = await probeRoute(p);
        console.log(`[Status ${result.status}] -> https://${LIVE_HOST}${result.path}`);
        if (result.status !== 404) {
            console.log(`\n🎯 TARGET ACQUIRED! Active Endpoint Found: ${result.path}`);
            console.log(`Response Body: ${result.response}\n`);
        }
    }
    console.log("✨ Discovery sweep complete. If all returned 404, check your assigned API product subscription scope inside your Mastercard Developer project dashboard.");
}

runDiscovery();
