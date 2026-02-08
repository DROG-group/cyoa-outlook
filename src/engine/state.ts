import type { GameState, StateMutation } from "./types.js";

/** Returns a fresh initial game state (mirrors LokiJS init in original utils/index.js) */
export function createInitialState(): GameState {
  return {
    total_followers: 0,
    new_followers: 0,
    trust: 0,
    new_trust: 0,

    naam: "",
    afknaam: "",
    thumbUrl: "",
    slogan: "",
    goon: false,

    action1: "",
    credibility: "",
    tweetname: "",
    tweetresponse: "",
    twitterreaction: "",
    twitterreaction2: "",
    tweetprofile1: "",
    tweetprofile2: "",
    citizenOpinion: false,
    emotioneffect: "",
    problem1: "",
    choiceeffect: "",
    responsetweet1: "",
    responsetweet2: "",
    person1: "",
    issue: "",
    blame1: "",
    blame2: "",
    target: "",
    friend: "",
    nicety: "",
    spilleffect: "",
    tweettopic: "",
    conspiracy: "",
    followertweet: "",
    followertweet2: "",
    bobeffect: "",
    conspiracytopic: "",
    conspiracyorg: "",
    agenda21: "",
    followerresponse: "",
    followerresponse2: "",
    agendaresponse: "",
    kurteffect: "",
    denialeffect: "",
    defensetweet1: "",
    defensetweet2: "",
    feedback: "",
    followertweet1: "",
    postfollowertweet: "",
    victim: "",
    name: "",
    description: "",
    name2: "",
    pronoun: "",
    photoshop: "",

    badges_earned: [],
  };
}

/**
 * Apply state mutations to produce a new state.
 *
 * `followers` and `trust` are additive deltas (matching the original statusUpdate logic).
 * All other keys are direct assignments.
 */
export function applyMutations(state: GameState, mutations: StateMutation): GameState {
  const next = { ...state };

  if (mutations.followers != null) {
    next.total_followers = state.total_followers + (mutations.followers as number);
    next.new_followers = mutations.followers as number;
  } else {
    next.new_followers = 0;
  }

  if (mutations.trust != null) {
    next.trust = state.trust + (mutations.trust as number);
    next.new_trust = mutations.trust as number;
  } else {
    next.new_trust = 0;
  }

  for (const [key, value] of Object.entries(mutations)) {
    if (key === "followers" || key === "trust" || key === "nextStep") continue;
    (next as Record<string, unknown>)[key] = value;
  }

  return next;
}

/** Format a credibility text gauge bar from trust score */
export function formatCredibilityGauge(trust: number): string {
  // trust range is roughly -100 to +100, map to 0-10 bar segments
  const normalized = Math.max(0, Math.min(10, Math.round((trust + 100) / 20)));
  const filled = "=".repeat(normalized);
  const empty = "-".repeat(10 - normalized);
  const label =
    normalized <= 2 ? "Very Low" :
    normalized <= 4 ? "Low" :
    normalized <= 6 ? "Medium" :
    normalized <= 8 ? "High" :
    "Very High";
  return `[${filled}${empty}] ${label}`;
}

/** Format follower delta as a display string */
export function formatDelta(value: number): string {
  if (value > 0) return `(+${value})`;
  if (value < 0) return `(${value})`;
  return "";
}
