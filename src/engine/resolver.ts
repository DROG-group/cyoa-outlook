import type { StoryGraph, StoryNode, ChoiceNode, GameState, ChoiceOption } from "./types.js";
import { applyMutations } from "./state.js";
import { renderCard, type RenderContext } from "../cards/renderer.js";

export interface ResolveResult {
  /** The Adaptive Card JSON to return to Outlook */
  card: Record<string, unknown>;
  /** Updated game state after applying mutations */
  newState: GameState;
  /** The node ID the session should advance to */
  newNodeId: string;
}

/**
 * Resolve a player's choice and produce the next Adaptive Card.
 *
 * This is the core game loop:
 * 1. Find the choice option the player selected
 * 2. Apply any state mutations
 * 3. Look ahead to determine what content + actions to show
 * 4. Render the card
 */
export function resolveChoice(
  graph: StoryGraph,
  currentNodeId: string,
  choiceValue: string,
  state: GameState,
  ctx: RenderContext,
): ResolveResult {
  const currentNode = graph.nodes[currentNodeId];
  if (!currentNode) {
    throw new Error(`Node not found: ${currentNodeId}`);
  }

  // Handle the special "__continue" action (for nodes without choices)
  if (choiceValue === "__continue") {
    if (currentNode.type === "message" || currentNode.type === "component") {
      return resolveNavigation(graph, currentNode.trigger, state, false, ctx);
    }
    throw new Error(`Cannot continue from node type: ${currentNode.type}`);
  }

  // Find the selected option
  if (currentNode.type !== "choice") {
    throw new Error(`Expected choice node, got: ${currentNode.type}`);
  }

  const option = currentNode.options.find((o) => o.value === choiceValue);
  if (!option) {
    throw new Error(`Choice value not found: ${choiceValue} in node ${currentNodeId}`);
  }

  // Apply state mutations
  let newState = state;
  if (option.stateMutations) {
    newState = applyMutations(state, option.stateMutations);
  }

  const showStatus = option.showStatus === true;

  return resolveNavigation(graph, option.trigger, newState, showStatus, ctx);
}

/**
 * Navigate to a target node and render the appropriate card.
 *
 * Performs look-ahead merging: if a message/component node's trigger
 * is a choice node, they are merged into a single card.
 */
function resolveNavigation(
  graph: StoryGraph,
  targetNodeId: string,
  state: GameState,
  showStatus: boolean,
  ctx: RenderContext,
): ResolveResult {
  const targetNode = graph.nodes[targetNodeId];
  if (!targetNode) {
    throw new Error(`Target node not found: ${targetNodeId}`);
  }

  // Look-ahead: if the target is a message/component whose trigger is a choice, merge them
  let contentNode: StoryNode = targetNode;
  let choiceNode: ChoiceNode | null = null;
  let advanceToNodeId = targetNodeId;

  if (targetNode.type === "message" || targetNode.type === "component") {
    const nextNode = graph.nodes[targetNode.trigger];
    if (nextNode && nextNode.type === "choice") {
      // Merge: show the content node's body + the choice node's actions
      choiceNode = nextNode;
      advanceToNodeId = nextNode.id;
    }
  } else if (targetNode.type === "choice") {
    // Standalone choice node (rare) -- just show actions
    choiceNode = targetNode;
    advanceToNodeId = targetNode.id;
  }

  const card = renderCard(contentNode, choiceNode, state, showStatus, ctx);

  return {
    card,
    newState: state,
    newNodeId: advanceToNodeId,
  };
}

/**
 * Render the initial card for a new game session.
 */
export function resolveInitial(
  graph: StoryGraph,
  state: GameState,
  ctx: RenderContext,
): ResolveResult {
  return resolveNavigation(graph, graph.entryNodeId, state, false, ctx);
}
