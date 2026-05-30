const Busboy = require('busboy');
const FormData = require('form-data');
const https = require('https');
const { verifyToken } = require('./auth');

// Disable Vercel's default body parser for multipart support
module.exports.config = {
    api: {
        bodyParser: false,
    },
};

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify auth token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token) {
        const user = verifyToken(token);
        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
        }
    }

    try {
        const { audioBuffer, filename, apiKey, displayName, creatorType, creatorId } = await parseMultipart(req);

        if (!apiKey) {
            return res.status(400).json({ error: 'API Key is required. Please enter your Roblox Open Cloud API Key.' });
        }

        if (!audioBuffer || !displayName || !creatorType || !creatorId) {
            return res.status(400).json({ error: 'Missing required fields: audioFile, displayName, creatorType, creatorId' });
        }

        // Build the Roblox API request metadata
        const creatorField = creatorType === 'group'
            ? { groupId: String(creatorId) }
            : { userId: String(creatorId) };

        const requestPayload = JSON.stringify({
            assetType: 'Audio',
            displayName: displayName,
            description: 'Uploaded via Audio Forge',
            creationContext: {
                creator: creatorField
            }
        });

        // Build multipart form for Roblox
        const form = new FormData();
        form.append('request', requestPayload, { contentType: 'application/json' });
        form.append('fileContent', audioBuffer, {
            filename: filename || 'audio.mp3',
            contentType: filename && filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'
        });

        // Send to Roblox Open Cloud API using the USER's API key
        const robloxResponse = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'apis.roblox.com',
                path: '/assets/v1/assets',
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    ...form.getHeaders()
                }
            };

            const request = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    resolve({ status: response.statusCode, body: data });
                });
            });

            request.on('error', reject);
            form.pipe(request);
        });

        let responseBody;
        try {
            responseBody = JSON.parse(robloxResponse.body);
        } catch {
            responseBody = { raw: robloxResponse.body };
        }

        if (robloxResponse.status >= 200 && robloxResponse.status < 300) {
            return res.status(200).json({
                success: true,
                message: 'Audio upload submitted to Roblox!',
                operation: responseBody
            });
        } else {
            return res.status(robloxResponse.status >= 400 ? robloxResponse.status : 500).json({
                success: false,
                error: responseBody.message || responseBody.error || 'Roblox API error',
                details: responseBody
            });
        }

    } catch (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
};

// Parse multipart/form-data from the incoming request
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const result = {
            audioBuffer: null,
            filename: '',
            apiKey: '',
            displayName: '',
            creatorType: '',
            creatorId: ''
        };

        const busboy = Busboy({ headers: req.headers });
        const chunks = [];

        busboy.on('file', (fieldname, file, info) => {
            result.filename = info.filename || 'audio.mp3';
            file.on('data', (data) => chunks.push(data));
            file.on('end', () => {
                result.audioBuffer = Buffer.concat(chunks);
            });
        });

        busboy.on('field', (fieldname, val) => {
            if (fieldname === 'apiKey') result.apiKey = val;
            if (fieldname === 'displayName') result.displayName = val;
            if (fieldname === 'creatorType') result.creatorType = val;
            if (fieldname === 'creatorId') result.creatorId = val;
        });

        busboy.on('finish', () => resolve(result));
        busboy.on('error', reject);

        req.pipe(busboy);
    });
}
