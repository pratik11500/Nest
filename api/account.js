import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
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

  if (req.method === 'PATCH') {
    // Handle profile updates (username, profile_picture)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      const { username, profilePicture } = req.body;

      if (!username && !profilePicture) {
        console.warn('No valid fields provided for profile update');
        return res.status(400).json({ error: 'At least one field (username, profilePicture) is required' });
      }

      try {
        const updates = {};
        const params = [];
        let paramIndex = 1;

        if (username) {
          if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
          }
          updates.username = `username = $${paramIndex++}`;
          params.push(username);
        }

        if (profilePicture) {
          if (profilePicture.size > 2 * 1024 * 1024) {
            return res.status(400).json({ error: 'Profile picture must be less than 2MB' });
          }
          // Assuming profilePicture is a Buffer or base64 string
          updates.profile_picture = `profile_picture = $${paramIndex++}`;
          params.push(Buffer.from(profilePicture, 'base64')); // Adjust based on actual input format
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update' });
        }

        const query = `
          UPDATE users
          SET ${Object.values(updates).join(', ')}
          WHERE id = $${paramIndex}
          RETURNING username, profile_picture
        `;
        params.push(userId);

        const result = await sql(query, params);

        if (result.length === 0) {
          console.warn('User not found for id:', userId);
          return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = result[0];
        console.log('Profile updated:', { id: userId, username: updatedUser.username });

        const profilePictureBase64 = updatedUser.profile_picture
          ? `data:image/jpeg;base64,${Buffer.from(updatedUser.profile_picture).toString('base64')}`
          : null;

        return res.status(200).json({
          message: 'Profile updated successfully',
          username: updatedUser.username,
          profile_picture: profilePictureBase64
        });
      } catch (error) {
        console.error('Profile update failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    // Handle password update
    const { currentPassword, newPassword, email } = req.body;

    if (!currentPassword && !email) {
      console.warn('Missing required fields for account update');
      return res.status(400).json({ error: 'Current password is required' });
    }

    try {
      // Verify current password
      const userResult = await sql('SELECT password_hash FROM users WHERE id = $1', [userId]);
      if (userResult.length === 0) {
        console.warn('User not found for id:', userId);
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult[0];
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isPasswordValid) {
        console.warn('Invalid current password for userId:', userId);
        return res.status(401).json({ error: 'Invalid current password' });
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await sql('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
        console.log('Password updated for userId:', userId);
        return res.status(200).json({ message: 'Password updated successfully' });
      }

      // Email updates are not supported (no email column)
      if (email) {
        console.warn('Email update attempted but email column not supported');
        return res.status(400).json({ error: 'Email updates are not supported' });
      }

      return res.status(400).json({ error: 'No valid fields to update' });
    } catch (error) {
      console.error('Account update failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      console.warn('Missing current password for account deletion');
      return res.status(400).json({ error: 'Current password is required' });
    }

    try {
      const userResult = await sql('SELECT password_hash FROM users WHERE id = $1', [userId]);
      if (userResult.length === 0) {
        console.warn('User not found for id:', userId);
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult[0];
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isPasswordValid) {
        console.warn('Invalid current password for userId:', userId);
        return res.status(401).json({ error: 'Invalid current password' });
      }

      await sql('DELETE FROM users WHERE id = $1', [userId]);
      console.log('Account deleted for userId:', userId);
      return res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
      console.error('Account deletion failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  console.warn('Invalid method:', req.method);
  return res.status(405).json({ error: 'Method not allowed' });
}