import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).end();
        return;
    }

    let body;
    try {
        body = await getBody(req);
    } catch {
        res.status(400).end();
        return;
    }

    const { action, username, password } = body;

    if (!action || !username || !password) {
        res.status(400).json({ error: 'Missing fields' });
        return;
    }

    const sql = neon(process.env.DATABASE_URL);

    try {
        if (action === 'register') {
            if (username.length < 3 || password.length < 6) {
                res.status(400).json({ error: 'Invalid username or password length' });
                return;
            }

            const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
            if (existing.length > 0) {
                res.status(400).json({ error: 'Username already taken' });
                return;
            }

            const hashed = await bcrypt.hash(password, 10);
            const [user] = await sql`INSERT INTO users (username, password) VALUES (${username}, ${hashed}) RETURNING id, username`;

            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
            await sql`UPDATE users SET last_active = NOW() WHERE id = ${user.id}`;

            res.status(201).json({ token, user: { id: user.id, username: user.username } });
        } else if (action === 'login') {
            const [user] = await sql`SELECT id, username, password FROM users WHERE username = ${username}`;
            if (!user || !(await bcrypt.compare(password, user.password))) {
                res.status(401).json({ error: 'Invalid username or password' });
                return;
            }

            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
            await sql`UPDATE users SET last_active = NOW() WHERE id = ${user.id}`;

            res.json({ token, user: { id: user.id, username: user.username } });
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
}