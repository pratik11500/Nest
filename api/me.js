import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

export default async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const user = jwt.verify(token, JWT_SECRET);

    const [userData] = await sql`
      SELECT id, username, email, bio, profile_picture
      FROM users
      WHERE id = ${user.id}
    `;
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    const response = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      bio: userData.bio,
      profile_picture: userData.profile_picture ? `data:image/jpeg;base64,${Buffer.from(userData.profile_picture).toString('base64')}` : null
    };
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in me.js:', error);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};