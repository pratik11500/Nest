import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).end();
        return;
    }

    const sql = neon(process.env.DATABASE_URL);

    try {
        const data = await sql`SELECT username, last_active FROM users WHERE last_active > (NOW() - INTERVAL '5 minutes') ORDER BY last_active DESC`;
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
}