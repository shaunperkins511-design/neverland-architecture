'use strict';
const http = require('http');

const server = http.createServer((req, res) => {
    console.log(`📥 Incoming ${req.method} request to: ${req.url}`);
    
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Missing Authorization header" }));
        return;
    }

    if (req.method === 'POST' && req.url === '/issuer/v1/cards') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const data = body ? JSON.parse(body) : {};
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: "SUCCESS",
                card_id: "mc_virtual_" + Math.random().toString(36).substring(2, 10),
                entity: data.entity_name || "4MIDABLE CURRCEES LLC",
                spend_limit: data.spend_limit || 250000,
                currency: data.currency || "USD",
                created_at: new Date().toISOString()
            }, null, 2));
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Endpoint Not Found", path: req.url }));
    }
});

server.listen(8888, () => {
    console.log("🚀 4MIDABLE Local Core active on http://localhost:8888");
});
