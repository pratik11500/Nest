import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

export default async (req, res) => {
  try {
    // Authenticate user
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const user = jwt.verify(token, JWT_SECRET);

    if (req.method === 'PATCH') {
      const { currentPassword, newPassword, newEmail } = req.body;
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }

      // Verify current password
      const [userData] = await sql`
        SELECT password FROM users WHERE id = ${user.id}
      `;
      if (!userData || !(await bcrypt.compare(currentPassword, userData.password))) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await sql`
          UPDATE users SET password = ${hashedPassword} WHERE id = ${user.id}
        `;
        return res.status(200).json({ message: 'Password updated successfully' });
      }

      if (newEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
        await sql`
          UPDATE users SET email = ${newEmail} WHERE id = ${user.id}
        `;
        return res.status(200).json({ message: 'Email updated successfully' });
      }

      return res.status(400).json({ error: 'No valid update provided' });
    } else if (req.method === 'DELETE') {
      const { currentPassword } = req.body;
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }

      // Verify current password
      const [userData] = await sql`
        SELECT password FROM users WHERE id = ${user.id}
      `;
      if (!userData || !(await bcrypt.compare(currentPassword, userData.password))) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }

      // Delete user and related data (messages and edit_history cascade)
      await sql`
        DELETE FROM users WHERE id = ${user.id}
      `;
      return res.status(200).json({ message: 'Account deleted successfully' });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in account.js:', error);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};