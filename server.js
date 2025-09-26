const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL // Replace with your Neon DB connection string
});

app.use(cors({ origin: 'http://localhost:3000' })); // Adjust for your frontend URL
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // Replace with secure secret

// Middleware to verify JWT
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

// PATCH /api/messages/:id
app.patch('/api/messages/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const userId = req.user.id;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const client = await pool.connect();

    // Fetch current message
    const messageResult = await client.query(
      'SELECT * FROM messages WHERE id = $1',
      [id]
    );
    if (messageResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = messageResult.rows[0];
    if (message.author_id !== userId) {
      client.release();
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

// Example: GET /api/messages (adjust as needed)
app.get('/api/messages', async (req, res) => {
  try {
    const client = await pool.connect();
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
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
