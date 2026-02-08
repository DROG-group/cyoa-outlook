/**
 * Validate the story graph for:
 * 1. Referential integrity (all triggers point to existing nodes)
 * 2. Reachability (all nodes reachable from entry)
 * 3. Choice completeness (every choice has at least one option)
 * 4. Template variable coverage (all {{vars}} have upstream assignments)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface StoryGraph {
  version: string;
  entryNodeId: string;
  nodes: Record<string, any>;
}

function validate(graphPath: string) {
  const graph: StoryGraph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const nodes = graph.nodes;
  const nodeIds = new Set(Object.keys(nodes));

  let errors = 0;
  let warnings = 0;

  console.log(`Validating ${nodeIds.size} nodes...\n`);

  // 1. Referential Integrity
  console.log("=== Referential Integrity ===");
  const brokenTriggers: string[] = [];

  for (const [id, node] of Object.entries(nodes) as [string, any][]) {
    if (node.trigger && !nodeIds.has(node.trigger)) {
      brokenTriggers.push(`${id} -> ${node.trigger}`);
      errors++;
    }
    if (node.options) {
      for (const opt of node.options) {
        if (opt.trigger && !nodeIds.has(opt.trigger)) {
          brokenTriggers.push(`${id} option "${opt.value}" -> ${opt.trigger}`);
          errors++;
        }
      }
    }
  }

  if (brokenTriggers.length === 0) {
    console.log("  All triggers resolve to existing nodes.");
  } else {
    console.log(`  BROKEN TRIGGERS (${brokenTriggers.length}):`);
    brokenTriggers.forEach((t) => console.log(`    ${t}`));
  }

  // 2. Reachability (BFS from entry)
  console.log("\n=== Reachability ===");
  const visited = new Set<string>();
  const queue = [graph.entryNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = nodes[current];
    if (!node) continue;

    if (node.trigger && nodeIds.has(node.trigger)) {
      queue.push(node.trigger);
    }
    if (node.options) {
      for (const opt of node.options) {
        if (opt.trigger && nodeIds.has(opt.trigger)) {
          queue.push(opt.trigger);
        }
      }
    }
  }

  const unreachable = [...nodeIds].filter((id) => !visited.has(id));
  console.log(`  Reachable: ${visited.size}/${nodeIds.size}`);
  if (unreachable.length > 0) {
    console.log(`  UNREACHABLE (${unreachable.length}):`);
    unreachable.forEach((id) => {
      console.log(`    ${id}`);
      warnings++;
    });
  }

  // 3. Choice Completeness
  console.log("\n=== Choice Completeness ===");
  const emptyChoices: string[] = [];
  for (const [id, node] of Object.entries(nodes) as [string, any][]) {
    if (node.type === "choice" && (!node.options || node.options.length === 0)) {
      emptyChoices.push(id);
      errors++;
    }
  }

  if (emptyChoices.length === 0) {
    console.log("  All choice nodes have at least one option.");
  } else {
    console.log(`  EMPTY CHOICES (${emptyChoices.length}):`);
    emptyChoices.forEach((id) => console.log(`    ${id}`));
  }

  // 4. Template Variable Coverage
  console.log("\n=== Template Variables ===");
  const templateVarsUsed = new Set<string>();
  const templateVarsAssigned = new Set<string>();

  for (const node of Object.values(nodes) as any[]) {
    // Find {{var}} usage in messages and component props
    const texts: string[] = [];
    if (node.text) texts.push(node.text);
    if (node.props) {
      for (const val of Object.values(node.props)) {
        if (typeof val === "string") texts.push(val);
      }
    }

    for (const text of texts) {
      const matches = text.matchAll(/\{\{(\w+)\}\}/g);
      for (const match of matches) {
        templateVarsUsed.add(match[1]);
      }
    }

    // Find variable assignments in stateMutations
    if (node.options) {
      for (const opt of node.options) {
        if (opt.stateMutations) {
          for (const key of Object.keys(opt.stateMutations)) {
            templateVarsAssigned.add(key);
          }
        }
      }
    }
  }

  const unassigned = [...templateVarsUsed].filter((v) => !templateVarsAssigned.has(v));
  console.log(`  Variables used in templates: ${[...templateVarsUsed].sort().join(", ")}`);
  console.log(`  Variables assigned via mutations: ${templateVarsAssigned.size}`);
  if (unassigned.length > 0) {
    console.log(`  USED BUT NEVER ASSIGNED (${unassigned.length}):`);
    unassigned.forEach((v) => {
      console.log(`    {{${v}}}`);
      warnings++;
    });
  }

  // 5. Summary stats
  console.log("\n=== Summary ===");
  const types = { message: 0, choice: 0, component: 0 };
  for (const node of Object.values(nodes) as any[]) {
    types[node.type as keyof typeof types]++;
  }
  console.log(`  Messages: ${types.message}`);
  console.log(`  Choices: ${types.choice}`);
  console.log(`  Components: ${types.component}`);
  console.log(`  Total options: ${Object.values(nodes).filter((n: any) => n.type === "choice").reduce((sum: number, n: any) => sum + (n.options?.length ?? 0), 0)}`);
  console.log(`  Status triggers: ${Object.values(nodes).filter((n: any) => n.type === "choice").flatMap((n: any) => n.options ?? []).filter((o: any) => o.showStatus).length}`);

  console.log(`\n${errors} errors, ${warnings} warnings`);
  return errors === 0;
}

// CLI entry
if (process.argv[1]?.includes("validate-graph")) {
  const graphPath = resolve(process.argv[2] || resolve(__dirname, "../data/story-graph.json"));
  console.log(`Validating: ${graphPath}\n`);
  const ok = validate(graphPath);
  process.exit(ok ? 0 : 1);
}

export { validate };
