import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

async function getBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            try {
                const body = Buffer.concat(chunks).toString();
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const sql = neon(process.env.DATABASE_URL);

    try {
        if (req.method === 'GET') {
            const sinceId = url.searchParams.get('since_id');
            let query;
            if (sinceId && parseInt(sinceId) > 0) {
                query = sql`SELECT m.id, m.text, m.created_at, u.username as author FROM messages m JOIN users u ON m.author_id = u.id WHERE m.id > ${parseInt(sinceId)} ORDER BY m.id ASC`;
            } else {
                query = sql`SELECT m.id, m.text, m.created_at, u.username as author FROM messages m JOIN users u ON m.author_id = u.id ORDER BY m.id ASC LIMIT 100`;
            }
            const data = await query;
            res.json(data);
        } else if (req.method === 'POST') {
            const body = await getBody(req);
            const auth = req.headers.authorization;
            if (!auth || !auth.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const token = auth.substring(7);
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch {
                res.status(401).json({ error: 'Invalid token' });
                return;
            }
            const { text } = body;
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                res.status(400).json({ error: 'Invalid message' });
                return;
            }
            const [msg] = await sql`INSERT INTO messages (author_id, text) VALUES (${decoded.userId}, ${text.trim()}) RETURNING id, author_id, text, created_at`;
            const [fullMsg] = await sql`SELECT m.id, m.text, m.created_at, u.username as author FROM messages m JOIN users u ON m.author_id = u.id WHERE m.id = ${msg.id}`;
            await sql`UPDATE users SET last_active = NOW() WHERE id = ${decoded.userId}`;
            res.status(201).json(fullMsg);
        } else {
            res.status(405).end();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
}