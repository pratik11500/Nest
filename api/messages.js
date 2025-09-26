import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

export default async (req, res) => {
  try {
    let user = null;
    if (req.method === 'POST' || req.method === 'PATCH') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    if (req.method === 'GET') {
      console.log('DATABASE_URL:', process.env.DATABASE_URL);
      const messages = await sql`
        SELECT m.*, u.username AS author,
               COALESCE(
                 (SELECT json_agg(json_build_object('old_text', eh.old_text, 'edited_at', eh.edited_at))
                  FROM edit_history eh WHERE eh.message_id = m.id),
                 '[]'
               ) AS edit_history
        FROM messages m
        JOIN users u ON m.author_id = u.id
        ORDER BY m.created_at
      `;
      res.status(200).json(messages);
    } else if (req.method === 'POST') {
      console.log('DATABASE_URL:', process.env.DATABASE_URL);
      const { text, parent_message_id } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }
      const [newMessage] = await sql`
        INSERT INTO messages (author_id, text, parent_message_id)
        VALUES (${user.id}, ${text}, ${parent_message_id || null})
        RETURNING id, author_id, text, created_at, parent_message_id, last_edited_at,
                  (SELECT username FROM users WHERE id = ${user.id}) AS author,
                  '[]'::json AS edit_history
      `;
      res.status(201).json(newMessage);
    } else if (req.method === 'PATCH') {
      const messageId = req.url.split('/').pop();
      const { text } = req.body;
      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }
      const [message] = await sql`
        SELECT * FROM messages WHERE id = ${messageId}
      `;
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      if (message.author_id !== user.id) {
        return res.status(403).json({ error: 'Unauthorized to edit this message' });
      }
      await sql`
        INSERT INTO edit_history (message_id, old_text, edited_at)
        VALUES (${messageId}, ${message.text}, NOW())
      `;
      await sql`
        UPDATE messages
        SET text = ${text}, last_edited_at = NOW()
        WHERE id = ${messageId}
      `;
      const [updatedMessage] = await sql`
        SELECT m.*, u.username AS author,
               COALESCE(
                 (SELECT json_agg(json_build_object('old_text', eh.old_text, 'edited_at', eh.edited_at))
                  FROM edit_history eh WHERE eh.message_id = m.id),
                 '[]'
               ) AS edit_history
        FROM messages m
        JOIN users u ON m.author_id = u.id
        WHERE m.id = ${messageId}
      `;
      if (!updatedMessage) {
        return res.status(500).json({ error: 'Failed to retrieve updated message' });
      }
      res.status(200).json(updatedMessage);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in messages.js:', error);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};
