'use strict';
require('dotenv').config();
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SocksProxyAgent } = require('socks-proxy-agent');

const LIVE_HOST = "api.mastercard.com";
const PRODUCTION_ENDPOINT = "/mastercard-processing-core/v1/cards";
const TOR_PROXY = "socks5://127.0.0.1:9050"; // Local Tor SOCKS5 Daemon

function getSigningKey() {
    const keyPath = path.join(__dirname, 'certs/mastercard_private.key');
    if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8');
    }
    // Fallback temporary key generation for structure validation
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
        oauth_consumer_key: consumerKey || "4MIDABLE_TOR_TEST_KEY",
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

async function executeTorRoutedRequest() {
    const payload = {
        card_product_type: "CORPORATE_VIRTUAL",
        spend_limit: 250000,
        currency: "USD",
        entity_name: "4MIDABLE CURRCEES LLC"
    };

    const requestBody = JSON.stringify(payload);
    const targetUrl = `https://${LIVE_HOST}${PRODUCTION_ENDPOINT}`;
    const privateKeyPem = getSigningKey();
    const consumerKey = process.env.MC_PRODUCTION_CONSUMER_KEY;

    const authHeader = generateMastercardAuthHeader("POST", targetUrl, payload, consumerKey, privateKeyPem);
    const agent = new SocksProxyAgent(TOR_PROXY);

    const options = {
        hostname: LIVE_HOST,
        port: 443,
        path: PRODUCTION_ENDPOINT,
        method: 'POST',
        agent: agent, // Route request through Tor SOCKS5 proxy
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": authHeader,
            "Content-Length": Buffer.byteLength(requestBody)
        }
    };

    console.log(`🧅 Routing signed Mastercard request through Tor SOCKS5 (${TOR_PROXY})...`);

    const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
            console.log(`\nTor Response Status Code: ${res.statusCode}`);
            console.log(`Tor Response Payload:\n${responseData}`);
        });
    });

    req.on('error', (e) => {
        console.error(`❌ Tor Tunnel Error (Ensure 'tor' daemon is active): ${e.message}`);
    });

    req.write(requestBody);
    req.end();
}

executeTorRoutedRequest();
