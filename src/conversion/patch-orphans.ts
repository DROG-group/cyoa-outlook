/**
 * Patch the 5 bugs in story-graph.json that cause 17 orphan nodes.
 * (The remaining 2 orphans -- impersonation_4, impersonation_4_opt -- are intentional dead code.)
 *
 * Bug 1: pl_14.trigger "pl_15_opt" -> "pl_14_opt"
 * Bug 2: pl_36.trigger "pl_35_opt" -> "pl_36_opt"
 * Bug 3: pl_69_news_3.trigger "pl_59_news_3_opt" -> "pl_69_news_3_opt"
 * Bug 4: pl_67_opt option trigger "pl_68_opt" -> "pl_68" (restore skipped message)
 * Bug 5: Duplicate impersonation_19_opt -- restore first occurrence, add second as impersonation_19b_opt
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const graphPath = resolve(__dirname, "../data/story-graph.json");

const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
const nodes = graph.nodes;

// Bug 1: pl_14 trigger typo
console.log("Fix 1: pl_14.trigger 'pl_15_opt' -> 'pl_14_opt'");
console.log("  Before:", nodes.pl_14.trigger);
nodes.pl_14.trigger = "pl_14_opt";
console.log("  After:", nodes.pl_14.trigger);

// Bug 2: pl_36 trigger typo (causes 13 orphans)
console.log("\nFix 2: pl_36.trigger 'pl_35_opt' -> 'pl_36_opt'");
console.log("  Before:", nodes.pl_36.trigger);
nodes.pl_36.trigger = "pl_36_opt";
console.log("  After:", nodes.pl_36.trigger);

// Bug 3: pl_69_news_3 trigger typo (5 vs 6)
console.log("\nFix 3: pl_69_news_3.trigger 'pl_59_news_3_opt' -> 'pl_69_news_3_opt'");
console.log("  Before:", nodes.pl_69_news_3.trigger);
nodes.pl_69_news_3.trigger = "pl_69_news_3_opt";
console.log("  After:", nodes.pl_69_news_3.trigger);

// Bug 4: pl_67_opt skips pl_68 message
console.log("\nFix 4: pl_67_opt option trigger 'pl_68_opt' -> 'pl_68'");
const pl67opt = nodes.pl_67_opt;
console.log("  Before:", pl67opt.options[0].trigger);
pl67opt.options[0].trigger = "pl_68";
console.log("  After:", pl67opt.options[0].trigger);

// Bug 5: Duplicate impersonation_19_opt
// The converter kept only the 2nd occurrence ("Die a hero"/"Become the villain").
// We need to:
//   a) Restore the 1st occurrence as impersonation_19_opt ("This is wrong"/"Yeah, good point")
//   b) Move the 2nd occurrence to impersonation_19b_opt
//   c) Point impersonation_19.trigger to impersonation_19b_opt
console.log("\nFix 5: Duplicate impersonation_19_opt");
console.log("  Current impersonation_19_opt options:", nodes.impersonation_19_opt.options.map((o: any) => o.label));

// Save second occurrence as 19b
nodes.impersonation_19b_opt = {
  id: "impersonation_19b_opt",
  type: "choice",
  options: nodes.impersonation_19_opt.options, // "Die a hero" / "Become the villain"
};

// Restore first occurrence
nodes.impersonation_19_opt = {
  id: "impersonation_19_opt",
  type: "choice",
  options: [
    {
      value: "wrong",
      label: "This is wrong",
      trigger: "impersonation_19",
      showStatus: false,
    },
    {
      value: "good",
      label: "Yeah, good point",
      trigger: "impersonation_20",
      showStatus: false,
    },
  ],
};

// Point impersonation_19 to the new node
nodes.impersonation_19.trigger = "impersonation_19b_opt";

console.log("  impersonation_19_opt now:", nodes.impersonation_19_opt.options.map((o: any) => o.label));
console.log("  impersonation_19b_opt now:", nodes.impersonation_19b_opt.options.map((o: any) => o.label));
console.log("  impersonation_19.trigger:", nodes.impersonation_19.trigger);

// Write patched graph
writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");
console.log(`\nPatched graph written to ${graphPath}`);
console.log(`Total nodes: ${Object.keys(nodes).length}`);
