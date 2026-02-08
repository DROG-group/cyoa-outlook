import { Router, type Request, type Response } from "express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { StoryGraph } from "../engine/types.js";
import { resolveInitial } from "../engine/resolver.js";
import { createInitialState } from "../engine/state.js";
import { createSession } from "../db/repository.js";
import { sendGameEmail } from "../email/sender.js";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const graphPath = resolve(__dirname, "../data/story-graph.json");
let storyGraph: StoryGraph;
try {
  storyGraph = JSON.parse(readFileSync(graphPath, "utf-8")) as StoryGraph;
} catch {
  console.error(`Failed to load story graph from ${graphPath}`);
  process.exit(1);
}

export const startRouter = Router();

/**
 * POST /api/start
 *
 * Creates a new game session and sends the initial Adaptive Card email.
 *
 * Body: { email: string }
 * Response: { sessionId, status }
 */
startRouter.post("/start", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }

    // Create session
    const session = await createSession(email);

    // Render the initial card
    const state = createInitialState();
    const result = resolveInitial(storyGraph, state, {
      sessionId: session.id,
      apiBaseUrl: config.apiBaseUrl,
    });

    // Send the email
    const { html } = await sendGameEmail(email, result.card);

    return res.json({
      sessionId: session.id,
      status: "email_sent",
      // Include card and HTML for debugging/testing
      card: result.card,
      emailHtml: html,
    });
  } catch (err) {
    console.error("Start error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
