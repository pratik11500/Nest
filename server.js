const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

app.patch('/api/messages/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const username = req.user.username; // Adjust based on JWT payload
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  try {
    const client = await pool.connect();
    const messageResult = await client.query(
      'SELECT * FROM messages WHERE id = $1',
      [id]
    );
    if (messageResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Message not found' });
    }
    const message = messageResult.rows[0];
    if (message.username !== username) {
      client.release();
      return res.status(403).json({ error: 'Unauthorized to edit this message' });
    }
    await client.query(
      'INSERT INTO edit_history (message_id, old_text, edited_at) VALUES ($1, $2, NOW())',
      [id, message.content]
    );
    await client.query(
      'UPDATE messages SET content = $1, timestamp = NOW() WHERE id = $2',
      [content, id]
    );
    const updatedResult = await client.query(
      `SELECT m.*, m.username AS author,
              COALESCE(
                (SELECT json_agg(json_build_object('old_text', eh.old_text, 'edited_at', eh.edited_at))
                 FROM edit_history eh WHERE eh.message_id = m.id),
                '[]'
              ) AS edit_history
       FROM messages m
       WHERE m.id = $1`,
      [id]
    );
    client.release();
    if (updatedResult.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to retrieve updated message' });
    }
    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Server error while editing message' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      `SELECT m.*, m.username AS author,
              COALESCE(
                (SELECT json_agg(json_build_object('old_text', eh.old_text, 'edited_at', eh.edited_at))
                 FROM edit_history eh WHERE eh.message_id = m.id),
                '[]'
              ) AS edit_history
       FROM messages m
       ORDER BY m.timestamp`
    );
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
