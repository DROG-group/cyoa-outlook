/** The complete story graph loaded from story-graph.json */
export interface StoryGraph {
  version: "1.0";
  entryNodeId: string;
  chapters: Chapter[];
  nodes: Record<string, StoryNode>;
}

export interface Chapter {
  id: string;
  label: string;
  entryNodeId: string;
  badge: {
    image: string;
    type: string;
    content: string;
  };
}

/** Discriminated union of all node types */
export type StoryNode = MessageNode | ChoiceNode | ComponentNode;

export interface MessageNode {
  id: string;
  type: "message";
  text: string;
  trigger: string;
}

export interface ChoiceNode {
  id: string;
  type: "choice";
  options: ChoiceOption[];
}

export interface ChoiceOption {
  value: string;
  label: string;
  trigger: string;
  stateMutations?: StateMutation;
  showStatus?: boolean;
}

export interface ComponentNode {
  id: string;
  type: "component";
  componentType: "tweet" | "image" | "headline" | "badge" | "badge-all";
  props: Record<string, unknown>;
  trigger: string;
}

/**
 * State mutations extracted from statusUpdate() calls.
 * `followers` and `trust` are additive deltas.
 * All other keys are direct assignments.
 */
export interface StateMutation {
  followers?: number;
  trust?: number;
  [key: string]: unknown;
}

/** Per-session game state stored in the DB */
export interface GameState {
  total_followers: number;
  new_followers: number;
  trust: number;
  new_trust: number;

  // Profile
  naam: string;
  afknaam: string;
  thumbUrl: string;
  slogan: string;
  goon: boolean;

  // Narrative variables
  action1: string;
  credibility: string;
  tweetname: string;
  tweetresponse: string;
  twitterreaction: string;
  twitterreaction2: string;
  tweetprofile1: string;
  tweetprofile2: string;
  citizenOpinion: boolean;
  emotioneffect: string;
  problem1: string;
  choiceeffect: string;
  responsetweet1: string;
  responsetweet2: string;
  person1: string;
  issue: string;
  blame1: string;
  blame2: string;
  target: string;
  friend: string;
  nicety: string;
  spilleffect: string;
  tweettopic: string;
  conspiracy: string;
  followertweet: string;
  followertweet2: string;
  bobeffect: string;
  conspiracytopic: string;
  conspiracyorg: string;
  agenda21: string;
  followerresponse: string;
  followerresponse2: string;
  agendaresponse: string;
  kurteffect: string;
  denialeffect: string;
  defensetweet1: string;
  defensetweet2: string;
  feedback: string;
  followertweet1: string;
  postfollowertweet: string;
  victim: string;
  name: string;
  description: string;
  name2: string;
  pronoun: string;
  photoshop: string;

  // Chapter tracking
  badges_earned: string[];

  // Catch-all for any additional state variables
  [key: string]: unknown;
}
