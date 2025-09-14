const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL // Neon DB connection string
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // Replace with secure secret

module.exports = async (req, res) => {
  const client = await pool.connect();

  try {
    // Authenticate user for POST and PATCH
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
      // Fetch all messages with edit history
      const result = await client.query(
        `SELECT m.*, u.username AS author,
                COALESCE(
                  (SELECT json_agg(json_build_object('old_text', eh.old_text, 'edited_at', eh.edited_at))
                   FROM edit_history eh WHERE eh.message_id = m.id),
                  '[]'
                ) AS edit_history
         FROM messages m
         JOIN users u ON m.author_id = u.id
         ORDER BY m.created_at`
      );
      res.status(200).json(result.rows);
    } else if (req.method === 'POST') {
      // Create a new message
      const { text, parent_message_id } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await client.query(
        `INSERT INTO messages (author_id, text, parent_message_id)
         VALUES ($1, $2, $3)
         RETURNING id, author_id, text, created_at, parent_message_id, last_edited_at,
                   (SELECT username FROM users WHERE id = $1) AS author,
                   '[]'::json AS edit_history`,
        [user.id, text, parent_message_id || null]
      );
      res.status(201).json(result.rows[0]);
    } else if (req.method === 'PATCH') {
      // Edit an existing message
      const { id } = req.params;
      const { text } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Message ID is required' });
      }
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Fetch current message
      const messageResult = await client.query(
        'SELECT * FROM messages WHERE id = $1',
        [id]
      );
      if (messageResult.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = messageResult.rows[0];
      if (message.author_id !== user.id) {
        return res.status(403).json({ error: 'Unauthorized to edit this message' });
      }

      // Insert current text into edit_history
      await client.query(
        'INSERT INTO edit_history (message_id, old_text, edited_at) VALUES ($1, $2, NOW())',
        [id, message.text]
      );

      // Update message
      await client.query(
        'UPDATE messages SET text = $1, last_edited_at = NOW() WHERE id = $2',
        [text, id]
      );

      // Fetch updated message with edit history
      const updatedResult = await client.query(
        `SELECT m.*, u.username AS author,
                COALESCE(
                  (SELECT json_agg(json_build_object('old_text', eh.old_text, 'edited_at', eh.edited_at))
                   FROM edit_history eh WHERE eh.message_id = m.id),
                  '[]'
                ) AS edit_history
         FROM messages m
         JOIN users u ON m.author_id = u.id
         WHERE m.id = $1`,
        [id]
      );

      if (updatedResult.rows.length === 0) {
        return res.status(500).json({ error: 'Failed to retrieve updated message' });
      }

      res.status(200).json(updatedResult.rows[0]);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error handling messages:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};