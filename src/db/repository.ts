import { v4 as uuidv4 } from "uuid";
import { pool } from "./schema.js";
import type { GameState } from "../engine/types.js";
import { createInitialState } from "../engine/state.js";

export interface GameSession {
  id: string;
  email: string;
  current_node_id: string;
  state: GameState;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export async function createSession(email: string): Promise<GameSession> {
  const id = uuidv4();
  const state = createInitialState();

  const result = await pool.query(
    `INSERT INTO game_sessions (id, email, state)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, email, JSON.stringify(state)],
  );

  return mapRow(result.rows[0]);
}

export async function getSession(id: string): Promise<GameSession | null> {
  const result = await pool.query(
    `SELECT * FROM game_sessions WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}

export async function updateSession(
  id: string,
  nodeId: string,
  state: GameState,
): Promise<void> {
  await pool.query(
    `UPDATE game_sessions
     SET current_node_id = $2, state = $3, updated_at = NOW()
     WHERE id = $1`,
    [id, nodeId, JSON.stringify(state)],
  );
}

export async function markCompleted(id: string): Promise<void> {
  await pool.query(
    `UPDATE game_sessions SET completed_at = NOW() WHERE id = $1`,
    [id],
  );
}

function mapRow(row: any): GameSession {
  return {
    id: row.id,
    email: row.email,
    current_node_id: row.current_node_id,
    state: typeof row.state === "string" ? JSON.parse(row.state) : row.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}
