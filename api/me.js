import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).end();
        return;
    }

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

    const sql = neon(process.env.DATABASE_URL);

    try {
        const [user] = await sql`SELECT id, username FROM users WHERE id = ${decoded.userId}`;
        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        res.json({ id: user.id, username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
}