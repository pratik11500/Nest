import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    console.warn('Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  let username;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    username = decoded.username; // Assuming JWT contains username
    console.log('Token verified, username:', username);
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql('DELETE FROM messages WHERE author = $1', [username]);
    console.log('Messages cleared for username:', username);
    return res.status(200).json({ message: 'Chat cleared successfully' });
  } catch (error) {
    console.error('Error clearing chat:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}