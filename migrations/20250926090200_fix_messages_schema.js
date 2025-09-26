module.exports = {
  up: async (pgm) => {
    await pgm.db.query(`
      ALTER TABLE messages
        DROP COLUMN IF EXISTS username,
        DROP COLUMN IF EXISTS type,
        DROP COLUMN IF EXISTS content,
        DROP COLUMN IF EXISTS timestamp,
        ADD COLUMN IF NOT EXISTS author_id INTEGER NOT NULL REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS text TEXT NOT NULL,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS parent_message_id INTEGER REFERENCES messages(id);
    `);
  },
  down: async (pgm) => {
    await pgm.db.query(`
      ALTER TABLE messages
        DROP COLUMN IF EXISTS author_id,
        DROP COLUMN IF EXISTS text,
        DROP COLUMN IF EXISTS created_at,
        DROP COLUMN IF EXISTS last_edited_at,
        DROP COLUMN IF EXISTS parent_message_id,
        ADD COLUMN IF NOT EXISTS username VARCHAR(50) NOT NULL,
        ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text',
        ADD COLUMN IF NOT EXISTS content TEXT NOT NULL,
        ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
  },
};
