import { Router, type Request, type Response } from "express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { StoryGraph } from "../engine/types.js";
import { resolveChoice } from "../engine/resolver.js";
import { getSession, updateSession } from "../db/repository.js";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load story graph once at startup
const graphPath = resolve(__dirname, "../data/story-graph.json");
let storyGraph: StoryGraph;
try {
  storyGraph = JSON.parse(readFileSync(graphPath, "utf-8")) as StoryGraph;
} catch {
  console.error(`Failed to load story graph from ${graphPath}`);
  process.exit(1);
}

export const actionRouter = Router();

/**
 * POST /api/action
 *
 * Called by Outlook when a user clicks an Action.Http button.
 * Returns a replacement Adaptive Card JSON.
 *
 * Body: { sessionId, nodeId, choiceValue }
 * Response headers: CARD-UPDATE-IN-BODY: true
 */
actionRouter.post("/action", async (req: Request, res: Response) => {
  try {
    const { sessionId, nodeId, choiceValue } = req.body;

    if (!sessionId || !nodeId || !choiceValue) {
      return res.status(400).json({ error: "Missing sessionId, nodeId, or choiceValue" });
    }

    // Load session
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Replay protection: if the session has moved past this node,
    // return a "stale" card instead of reprocessing
    if (session.current_node_id !== nodeId) {
      // Re-resolve from current position to show the current card
      const currentResult = resolveChoice(
        storyGraph,
        session.current_node_id,
        "__continue",
        session.state,
        { sessionId, apiBaseUrl: config.apiBaseUrl },
      );

      res.setHeader("CARD-UPDATE-IN-BODY", "true");
      return res.json(currentResult.card);
    }

    // Resolve the choice
    const result = resolveChoice(storyGraph, nodeId, choiceValue, session.state, {
      sessionId,
      apiBaseUrl: config.apiBaseUrl,
    });

    // Persist state
    await updateSession(sessionId, result.newNodeId, result.newState);

    // Return the replacement card
    res.setHeader("CARD-UPDATE-IN-BODY", "true");
    return res.json(result.card);
  } catch (err) {
    console.error("Action error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
