import { Template } from "adaptivecards-templating";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { GameState, StoryNode, ChoiceNode, ComponentNode } from "../engine/types.js";
import { interpolate, interpolateProps } from "../engine/interpolator.js";
import { formatCredibilityGauge, formatDelta } from "../engine/state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load master card template once
const cardTemplateJson = JSON.parse(
  readFileSync(resolve(__dirname, "card-template.json"), "utf-8"),
);

const BADGE_IMAGES: Record<string, string> = {
  impersonation: "https://www.getbadnews.com/wp-content/uploads/2017/08/vermommen.png",
  emotion: "https://www.getbadnews.com/wp-content/uploads/2018/01/emotion.png",
  polarization: "https://www.getbadnews.com/wp-content/uploads/2017/08/polariseren.png",
  conspiracy: "https://www.getbadnews.com/wp-content/uploads/2017/08/complot.png",
  discredit: "https://www.getbadnews.com/wp-content/uploads/2017/08/discredit.png",
  trolling: "https://www.getbadnews.com/wp-content/uploads/2017/08/trollen.png",
};

const BADGE_ORDER = ["impersonation", "emotion", "polarization", "conspiracy", "discredit", "trolling"];

export interface RenderContext {
  sessionId: string;
  apiBaseUrl: string;
}

/**
 * Render an Adaptive Card for a story node using the AC Templating SDK.
 *
 * Builds a data context from the node + state, then expands the master template.
 */
export function renderCard(
  node: StoryNode,
  choiceNode: ChoiceNode | null,
  state: GameState,
  showStatusPanel: boolean,
  ctx: RenderContext,
): Record<string, unknown> {
  // Build the data context for template expansion
  const data: Record<string, unknown> = {
    showStatus: showStatusPanel,
    contentType: resolveContentType(node),

    // Status fields
    total_followers: state.total_followers,
    trust: state.trust,
    followerDelta: formatDelta(state.new_followers),
    followerDeltaColor: state.new_followers >= 0 ? "Good" : "Attention",
    trustDelta: formatDelta(state.new_trust),
    trustDeltaColor: state.new_trust >= 0 ? "Good" : "Attention",
    gauge: formatCredibilityGauge(state.trust),

    // Actions
    actions: buildActionsData(node, choiceNode, ctx),
  };

  // Content-type-specific fields
  switch (node.type) {
    case "message":
      data.text = interpolate(node.text, state);
      break;

    case "component":
      Object.assign(data, buildComponentData(node, state));
      break;
  }

  // Expand master template
  const template = new Template(cardTemplateJson);
  return template.expand({ $root: data }) as Record<string, unknown>;
}

function resolveContentType(node: StoryNode): string {
  if (node.type === "message") return "message";
  if (node.type === "choice") return "none";
  if (node.type === "component") return node.componentType;
  return "none";
}

function buildComponentData(node: ComponentNode, state: GameState): Record<string, unknown> {
  const props = interpolateProps(node.props, state);

  switch (node.componentType) {
    case "tweet":
      return {
        tweetName: props.name ?? "",
        tweetDescription: props.description ?? "",
        tweetText: props.tweet ?? "",
        tweetImage: props.image || "https://www.getbadnews.com/wp-content/uploads/2017/07/twitter-default.png",
      };

    case "badge":
      return {
        badgeImage: props.image ?? "",
        badgeType: props.type ?? "",
        badgeContent: props.content ?? "",
      };

    case "badge-all":
      return {
        badges: BADGE_ORDER.map((id) => ({
          earned: props[id] === true,
          image: BADGE_IMAGES[id],
        })),
      };

    case "headline":
      return {
        headlineContent: props.content ?? "",
        headlineName: props.name ?? "",
      };

    case "image":
      return {
        imageSrc: props.src ?? "",
      };

    default:
      return { text: `[Unknown component: ${node.componentType}]`, contentType: "message" };
  }
}

function buildActionsData(
  node: StoryNode,
  choiceNode: ChoiceNode | null,
  ctx: RenderContext,
): { title: string; url: string; body: string }[] {
  const url = `${ctx.apiBaseUrl}/api/action`;

  if (choiceNode) {
    return choiceNode.options.map((opt) => ({
      title: opt.label,
      url,
      body: JSON.stringify({ sessionId: ctx.sessionId, nodeId: choiceNode.id, choiceValue: opt.value }),
    }));
  }

  if (node.type === "message" || node.type === "component") {
    return [
      {
        title: "Continue",
        url,
        body: JSON.stringify({ sessionId: ctx.sessionId, nodeId: node.id, choiceValue: "__continue" }),
      },
    ];
  }

  return [];
}
