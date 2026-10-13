'use strict';
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 8080;
const MASTER_KEY = process.env.SOVEREIGN_MASTER_KEY || "sov_master_root_998877665544332211";

// Connect Native SQLite
const db = new DatabaseSync('./production_ledger.db');
console.log("✅ Sovereign Lithic Native Ledger connected.");

// Create Core Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
        key_id TEXT PRIMARY KEY,
        api_key TEXT UNIQUE,
        label TEXT,
        scopes TEXT,
        state TEXT,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cards (
        token TEXT PRIMARY KEY,
        card_number TEXT UNIQUE,
        cvv TEXT,
        exp_month TEXT,
        exp_year TEXT,
        last_four TEXT,
        spend_limit INTEGER,
        spend_limit_duration TEXT,
        state TEXT,
        type TEXT,
        memo TEXT,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
        token TEXT PRIMARY KEY,
        card_token TEXT,
        amount INTEGER,
        status TEXT,
        merchant_name TEXT,
        created_at TEXT
    );
`);

// Insert default root key if non-existent
try {
    const checkRoot = db.prepare(`SELECT * FROM api_keys WHERE api_key = ?`).get(MASTER_KEY);
    if (!checkRoot) {
        db.prepare(`INSERT INTO api_keys VALUES (?, ?, ?, ?, ?, ?)`).run(
            "key_" + crypto.randomBytes(8).toString('hex'),
            MASTER_KEY,
            "Root Production Key",
            "admin,cards:read,cards:write,authorizations:simulate",
            "ACTIVE",
            new Date().toISOString()
        );
    }
} catch (e) {
    console.error("Root Key Initialization Error:", e.message);
}

// Authentication Middleware
app.use((req, res, next) => {
    // Exempt API key generation endpoint if authenticated via Master/Admin key
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({
            message: "Please provide an API key in the form 'Authorization: [api-key]'",
            debugging_request_id: crypto.randomUUID()
        });
    }

    const keyRecord = db.prepare(`SELECT * FROM api_keys WHERE api_key = ? AND state = 'ACTIVE'`).get(authHeader);
    if (!keyRecord) {
        return res.status(401).json({
            message: "Invalid or inactive API key provided.",
            debugging_request_id: crypto.randomUUID()
        });
    }

    req.apiKeyMeta = keyRecord;
    next();
});

// -------------------------------------------------------------------
// API KEY MANAGEMENT ENDPOINTS (Lithic Dashboard Clone)
// -------------------------------------------------------------------

// POST /v1/api_keys - Create Production API Key
app.post('/v1/api_keys', (req, res) => {
    const { label = "Production App Key", scopes = "cards:read,cards:write,authorizations:simulate" } = req.body;

    const keyId = "key_" + crypto.randomBytes(8).toString('hex');
    const apiKey = "sov_live_" + crypto.randomBytes(24).toString('hex');
    const createdAt = new Date().toISOString();

    try {
        const stmt = db.prepare(`INSERT INTO api_keys VALUES (?, ?, ?, ?, ?, ?)`);
        stmt.run(keyId, apiKey, label, scopes, "ACTIVE", createdAt);

        res.status(201).json({
            key_id: keyId,
            api_key: apiKey,
            label: label,
            scopes: scopes.split(','),
            state: "ACTIVE",
            created_at: createdAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /v1/api_keys - List All Generated API Keys
app.get('/v1/api_keys', (req, res) => {
    try {
        const keys = db.prepare(`SELECT key_id, label, scopes, state, created_at FROM api_keys`).all();
        res.json({ data: keys });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /v1/api_keys/:key_id - Revoke an API Key
app.delete('/v1/api_keys/:key_id', (req, res) => {
    const keyId = req.params.key_id;
    try {
        db.prepare(`UPDATE api_keys SET state = 'REVOKED' WHERE key_id = ?`).run(keyId);
        res.json({ result: "revoked", key_id: keyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------------
// CORE CARD & AUTHORIZATION ENDPOINTS
// -------------------------------------------------------------------

// Luhn Algorithm Generator
function generateLuhnCard() {
    let prefix = "411111";
    let body = "";
    for (let i = 0; i < 9; i++) body += Math.floor(Math.random() * 10);
    let partial = prefix + body;
    let sum = 0, alt = true;
    for (let i = partial.length - 1; i >= 0; i--) {
        let n = parseInt(partial.charAt(i), 10);
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        sum += n;
        alt = !alt;
    }
    let checkDigit = (10 - (sum % 10)) % 10;
    return partial + checkDigit;
}

// POST /v1/cards - Issue a Card
app.post('/v1/cards', (req, res) => {
    const { type = "SINGLE_USE", spend_limit = 10000, spend_limit_duration = "TRANSACTION", memo = "" } = req.body;
    
    const token = "card_" + crypto.randomBytes(12).toString('hex');
    const cardNumber = generateLuhnCard();
    const lastFour = cardNumber.slice(-4);
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const createdAt = new Date().toISOString();

    try {
        const stmt = db.prepare(`INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(token, cardNumber, cvv, "12", "2030", lastFour, spend_limit, spend_limit_duration, "OPEN", type, memo, createdAt);
        
        res.status(201).json({
            token: token,
            pan: cardNumber,
            cvv: cvv,
            exp_month: "12",
            exp_year: "2030",
            last_four: lastFour,
            spend_limit: spend_limit,
            spend_limit_duration: spend_limit_duration,
            state: "OPEN",
            type: type,
            memo: memo,
            created: createdAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /v1/authorizations/simulate - Local Card Authorization Gateway
app.post('/v1/authorizations/simulate', (req, res) => {
    const { card_token, amount, merchant_name = "Sovereign Merchant" } = req.body;

    try {
        const card = db.prepare(`SELECT * FROM cards WHERE token = ?`).get(card_token);

        if (!card) {
            return res.status(404).json({ debugging_request_id: crypto.randomUUID(), message: "Card not found" });
        }

        if (card.state !== "OPEN") {
            return res.status(400).json({ result: "DECLINED", reason: "CARD_CLOSED" });
        }

        if (amount > card.spend_limit) {
            return res.status(400).json({ result: "DECLINED", reason: "INSUFFICIENT_LIMIT" });
        }

        const txToken = "tx_" + crypto.randomBytes(12).toString('hex');
        const createdAt = new Date().toISOString();

        db.prepare(`INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?)`).run(txToken, card_token, amount, "APPROVED", merchant_name, createdAt);

        res.json({
            token: txToken,
            card_token: card_token,
            amount: amount,
            result: "APPROVED",
            merchant_name: merchant_name,
            created_at: createdAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Sovereign Lithic Engine running on http://localhost:${PORT}`);
});
