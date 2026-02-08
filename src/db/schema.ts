import pg from "pg";
import { config } from "../config.js";

const pool = new pg.Pool({
  connectionString: config.database.connectionString,
});

export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS game_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL,
  current_node_id VARCHAR(100) NOT NULL DEFAULT 'impersonation_1',
  state           JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_email ON game_sessions(email);
`;

export async function initDB() {
  await pool.query(INIT_SQL);
}

export { pool };
