import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Cache-Control');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }

    const sinceId = parseInt(url.searchParams.get('since_id')) || 0;
    const userId = decoded.userId;
    const sql = neon(process.env.DATABASE_URL);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    res.write('\n'); // SSE initial comment

    let currentSince = sinceId;

    const messageInterval = setInterval(async () => {
        try {
            const newMsgs = await sql`
                SELECT m.id, m.text, m.created_at, u.username as author 
                FROM messages m 
                JOIN users u ON m.author_id = u.id 
                WHERE m.id > ${currentSince} AND m.author_id != ${userId}
                ORDER BY m.id ASC
            `;

            newMsgs.forEach(msg => {
                res.write(`data: ${JSON.stringify(msg)}\n\n`);
            });

            if (newMsgs.length > 0) {
                currentSince = newMsgs[newMsgs.length - 1].id;
            }
        } catch (err) {
            console.error('SSE message fetch error:', err);
        }
    }, 1000);

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(messageInterval);
        clearInterval(heartbeatInterval);
        res.end();
    });

    req.on('error', () => {
        clearInterval(messageInterval);
        clearInterval(heartbeatInterval);
        res.end();
    });
}