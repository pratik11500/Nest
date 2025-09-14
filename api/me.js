import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  let userId;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
    console.log('Token verified, userId:', userId);
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    const query = `
      SELECT id, username, bio, profile_picture 
      FROM users 
      WHERE id = $1
    `;
    const result = await sql(query, [userId]);

    if (result.length === 0) {
      console.warn('User not found for id:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result[0];
    console.log('User fetched:', { id: user.id, username: user.username });

    // Convert profile_picture (BYTEA) to base64 if present
    const profilePicture = user.profile_picture 
      ? `data:image/jpeg;base64,${Buffer.from(user.profile_picture).toString('base64')}`
      : null;

    return res.status(200).json({
      id: user.id,
      username: user.username,
      bio: user.bio,
      profile_picture: profilePicture
    });
  } catch (error) {
    console.error('Database query failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}