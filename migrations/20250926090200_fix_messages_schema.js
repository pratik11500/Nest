module.exports = {
  up: async (pgm) => {
    await pgm.db.query(`
      ALTER TABLE messages
        DROP COLUMN username,
        DROP COLUMN type,
        DROP COLUMN content,
        DROP COLUMN timestamp,
        ADD COLUMN author_id INTEGER NOT NULL REFERENCES users(id),
        ADD COLUMN text TEXT NOT NULL,
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ADD COLUMN last_edited_at TIMESTAMP WITH TIME ZONE;
    `);
  },
  down: async (pgm) => {
    await pgm.db.query(`
      ALTER TABLE messages
        DROP COLUMN author_id,
        DROP COLUMN text,
        DROP COLUMN created_at,
        DROP COLUMN last_edited_at,
        ADD COLUMN username VARCHAR(50) NOT NULL,
        ADD COLUMN type VARCHAR(20) DEFAULT 'text',
        ADD COLUMN content TEXT NOT NULL,
        ADD COLUMN timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
  },
};
