const crypto = require('crypto');

// Credentials - use env vars in production, fallback for dev
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Isalman0101@';
const AUTH_SECRET = process.env.AUTH_SECRET || 'af-secret-key-2026-hmac';

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Validate credentials
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            // Generate HMAC-signed token (24 hour expiry)
            const payload = JSON.stringify({
                user: username,
                role: 'admin',
                exp: Date.now() + (24 * 60 * 60 * 1000)
            });

            const payloadB64 = Buffer.from(payload).toString('base64');
            const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
            const token = payloadB64 + '.' + signature;

            return res.status(200).json({
                success: true,
                token: token,
                user: username,
                role: 'admin'
            });
        }

        return res.status(401).json({ error: 'Invalid username or password' });

    } catch (err) {
        console.error('Auth error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

// Export verify function for use by other API routes
module.exports.verifyToken = function(token) {
    try {
        const [payloadB64, signature] = token.split('.');
        const payload = Buffer.from(payloadB64, 'base64').toString();
        const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');

        if (signature !== expectedSig) return null;

        const data = JSON.parse(payload);
        if (data.exp < Date.now()) return null;

        return data;
    } catch {
        return null;
    }
};
