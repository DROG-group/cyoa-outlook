/**
 * AST-based converter: parses conversation.js and emits story-graph.json
 *
 * Handles:
 * - String messages -> MessageNode
 * - Arrow function messages (userData.xxx concat) -> MessageNode with {{xxx}} templates
 * - Options with string triggers -> ChoiceNode
 * - Options with function triggers (statusUpdate + return) -> ChoiceNode with stateMutations
 * - JSX components (Tweet, ImageWrapper, Headline, EarnedBadge, BadgeAll) -> ComponentNode
 * - JSX div components -> ComponentNode (type "message" with extracted text)
 * - STATUS trampoline flattening (return "status" -> showStatus: true)
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Handle CJS/ESM interop for @babel/traverse
const traverse = typeof _traverse === "function" ? _traverse : (_traverse as any).default;

interface RawNode {
  id: string;
  type: "message" | "choice" | "component";
  // message fields
  text?: string;
  trigger?: string;
  // choice fields
  options?: RawOption[];
  // component fields
  componentType?: string;
  props?: Record<string, unknown>;
}

interface RawOption {
  value: string;
  label: string;
  trigger: string;
  stateMutations?: Record<string, unknown>;
  showStatus?: boolean;
}

interface StoryGraph {
  version: "1.0";
  entryNodeId: string;
  chapters: { id: string; label: string; entryNodeId: string; badge: { image: string; type: string; content: string } }[];
  nodes: Record<string, RawNode>;
}

const CHAPTER_ORDER = ["impersonation", "emotion", "polarization", "conspiracy", "discredit", "trolling"];
const ARRAY_NAMES = ["IMPERSONATION", "EMOTION", "POLARIZATION", "CONSPIRACY", "DISCREDIT", "TROLLING", "ALL_DONE", "STATUS", "CHEAT"];

const COMPONENT_MAP: Record<string, string> = {
  Tweet: "tweet",
  ImageWrapper: "image",
  Headline: "headline",
  EarnedBadge: "badge",
  BadgeAll: "badge-all",
  Status: "status-internal",
};

// ---- AST Extraction Helpers ----

/** Recursively extract a JS value from an AST node */
function extractValue(node: t.Node): unknown {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isBooleanLiteral(node)) return node.value;
  if (t.isNullLiteral(node)) return null;
  if (t.isUnaryExpression(node) && node.operator === "-" && t.isNumericLiteral(node.argument)) {
    return -node.argument.value;
  }
  if (t.isTemplateLiteral(node)) {
    // Template literals: concatenate quasis and expressions
    let result = "";
    for (let i = 0; i < node.quasis.length; i++) {
      result += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
      if (i < node.expressions.length) {
        result += extractTemplateExpression(node.expressions[i]);
      }
    }
    return result;
  }
  return undefined;
}

/** Extract a string from a binary expression (string concatenation with userData.xxx) */
function extractConcatExpression(node: t.Node): string {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node)) return extractValue(node) as string;

  if (t.isMemberExpression(node)) {
    // userData.xxx -> {{xxx}}
    if (t.isIdentifier(node.object) && node.object.name === "userData" && t.isIdentifier(node.property)) {
      return `{{${node.property.name}}}`;
    }
    return `[expr]`;
  }

  if (t.isBinaryExpression(node) && node.operator === "+") {
    return extractConcatExpression(node.left) + extractConcatExpression(node.right);
  }

  if (t.isCallExpression(node)) {
    return "[call]";
  }

  return "[unknown]";
}

function extractTemplateExpression(node: t.Node): string {
  if (t.isMemberExpression(node) && t.isIdentifier(node.object) && node.object.name === "userData" && t.isIdentifier(node.property)) {
    return `{{${node.property.name}}}`;
  }
  return "[expr]";
}

/** Extract the body expression from an arrow function: () => (expr) or () => { ... return expr } */
function getArrowBody(node: t.ArrowFunctionExpression): t.Node {
  if (t.isBlockStatement(node.body)) {
    const returns = node.body.body.filter((s): s is t.ReturnStatement => t.isReturnStatement(s));
    if (returns.length > 0 && returns[returns.length - 1].argument) {
      return returns[returns.length - 1].argument!;
    }
    return node.body;
  }
  // Expression body: () => (expr)
  if (t.isParenthesizedExpression(node.body)) {
    return node.body.expression;
  }
  return node.body;
}

/** Extract statusUpdate() call arguments from an arrow function body */
function extractStatusUpdate(node: t.ArrowFunctionExpression): Record<string, unknown> | null {
  if (!t.isBlockStatement(node.body)) return null;

  for (const stmt of node.body.body) {
    if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
      const callee = stmt.expression.callee;
      if (t.isIdentifier(callee) && callee.name === "statusUpdate") {
        const arg = stmt.expression.arguments[0];
        if (t.isObjectExpression(arg)) {
          return extractObjectExpression(arg);
        }
      }
    }
  }
  return null;
}

/** Extract the return value from an arrow function body */
function extractReturn(node: t.ArrowFunctionExpression): string | null {
  if (!t.isBlockStatement(node.body)) return null;

  // Walk backwards to find the last return statement
  for (let i = node.body.body.length - 1; i >= 0; i--) {
    const stmt = node.body.body[i];
    if (t.isReturnStatement(stmt) && stmt.argument) {
      if (t.isStringLiteral(stmt.argument)) return stmt.argument.value;
      // Could be a conditional -- try extracting
      if (t.isConditionalExpression(stmt.argument)) {
        // Take the first branch as default
        if (t.isStringLiteral(stmt.argument.consequent)) return stmt.argument.consequent.value;
      }
    }
  }
  return null;
}

/** Extract key-value pairs from an ObjectExpression AST node */
function extractObjectExpression(node: t.ObjectExpression): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (t.isObjectProperty(prop)) {
      const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
      if (key) {
        const val = extractValue(prop.value);
        if (val !== undefined) {
          result[key] = val;
        } else if (t.isBinaryExpression(prop.value)) {
          // String concatenation in statusUpdate values
          result[key] = extractConcatExpression(prop.value);
        }
      }
    }
  }
  return result;
}

/** Extract JSX props from a JSXOpeningElement */
function extractJSXProps(element: t.JSXOpeningElement): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const attr of element.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
      const key = attr.name.name;
      if (attr.value) {
        if (t.isStringLiteral(attr.value)) {
          // Normalize "userData.xxx" patterns to "{{xxx}}"
          let val = attr.value.value;
          val = val.replace(/^userData\.(\w+)$/, "{{$1}}");
          props[key] = val;
        } else if (t.isJSXExpressionContainer(attr.value)) {
          const expr = attr.value.expression;
          if (t.isStringLiteral(expr)) {
            props[key] = expr.value;
          } else if (t.isBooleanLiteral(expr)) {
            props[key] = expr.value;
          } else if (t.isMemberExpression(expr)) {
            props[key] = extractConcatExpression(expr);
          }
        }
      } else {
        // Boolean attribute: <Component showTitle />
        props[key] = true;
      }
    }
  }
  return props;
}

/** Recursively extract text from a JSX tree (for <div><p>text {userData.x}</p></div>) */
function extractJSXText(node: t.Node): string {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isJSXText(node)) return node.value.trim();
  if (t.isJSXExpressionContainer(node)) {
    if (t.isMemberExpression(node.expression)) return extractConcatExpression(node.expression);
    if (t.isStringLiteral(node.expression)) return node.expression.value;
    return "";
  }
  if (t.isJSXElement(node)) {
    return node.children.map(extractJSXText).join("").trim();
  }
  if (t.isJSXFragment(node)) {
    return node.children.map(extractJSXText).join("").trim();
  }
  return "";
}

// ---- Main Processing ----

/** Process a single step object from the conversation array */
function processStep(objExpr: t.ObjectExpression): RawNode | null {
  let id = "";
  let message: string | undefined;
  let trigger: string | undefined;
  let options: RawOption[] | undefined;
  let componentType: string | undefined;
  let componentProps: Record<string, unknown> | undefined;
  let isArrowMessage = false;
  let triggerArrow: t.ArrowFunctionExpression | undefined;

  for (const prop of objExpr.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (!key) continue;

    switch (key) {
      case "id":
        if (t.isStringLiteral(prop.value)) id = prop.value.value;
        break;

      case "message":
        if (t.isStringLiteral(prop.value)) {
          message = prop.value.value;
        } else if (t.isArrowFunctionExpression(prop.value)) {
          isArrowMessage = true;
          const body = getArrowBody(prop.value);
          message = extractConcatExpression(body);
        }
        break;

      case "trigger":
        if (t.isStringLiteral(prop.value)) {
          trigger = prop.value.value;
        } else if (t.isArrowFunctionExpression(prop.value)) {
          triggerArrow = prop.value;
        }
        break;

      case "options":
        if (t.isArrayExpression(prop.value)) {
          options = [];
          for (const elem of prop.value.elements) {
            if (!elem || !t.isObjectExpression(elem)) continue;
            const opt = processOption(elem);
            if (opt) options.push(opt);
          }
        }
        break;

      case "component":
        if (t.isJSXElement(prop.value) || (t.isParenthesizedExpression(prop.value) && t.isJSXElement(prop.value.expression))) {
          const jsx = t.isJSXElement(prop.value) ? prop.value : (prop.value as t.ParenthesizedExpression).expression as t.JSXElement;
          const opening = jsx.openingElement;

          if (t.isJSXIdentifier(opening.name)) {
            const name = opening.name.name;
            if (COMPONENT_MAP[name]) {
              componentType = COMPONENT_MAP[name];
              componentProps = extractJSXProps(opening);
            } else if (name === "div" || name === "p" || name === "span") {
              // HTML element with text content
              componentType = "html-text";
              const text = extractJSXText(jsx);
              componentProps = { text };
            }
          }
        }
        break;
    }
  }

  if (!id) return null;

  // Determine node type
  if (options) {
    return { id, type: "choice", options };
  }

  if (componentType) {
    // Handle trigger for component nodes
    let compTrigger = trigger;
    if (triggerArrow) {
      compTrigger = extractReturn(triggerArrow) ?? undefined;
    }

    if (componentType === "html-text") {
      // Convert HTML div/p components to message nodes
      return {
        id,
        type: "message",
        text: (componentProps?.text as string) || "",
        trigger: compTrigger,
      };
    }

    if (componentType === "status-internal") {
      // The STATUS trampoline node -- we'll flatten references to it
      // but still record it for reference
      return {
        id,
        type: "component",
        componentType: "status-internal",
        props: {},
        trigger: compTrigger,
      };
    }

    return {
      id,
      type: "component",
      componentType,
      props: componentProps ?? {},
      trigger: compTrigger,
    };
  }

  if (message !== undefined) {
    let msgTrigger = trigger;
    if (triggerArrow) {
      // Function trigger on a message node (rare but handle it)
      msgTrigger = extractReturn(triggerArrow) ?? undefined;
    }
    return { id, type: "message", text: message, trigger: msgTrigger };
  }

  return null;
}

/** Process a single option object */
function processOption(objExpr: t.ObjectExpression): RawOption | null {
  let value = "";
  let label = "";
  let trigger = "";
  let stateMutations: Record<string, unknown> | undefined;
  let showStatus = false;

  for (const prop of objExpr.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : null;
    if (!key) continue;

    switch (key) {
      case "value":
        if (t.isStringLiteral(prop.value)) value = prop.value.value;
        break;
      case "label":
        if (t.isStringLiteral(prop.value)) label = prop.value.value;
        break;
      case "message":
        // Some options use "message" instead of "label" (e.g., impersonation_4_opt)
        if (t.isStringLiteral(prop.value) && !label) label = prop.value.value;
        break;
      case "trigger":
        if (t.isStringLiteral(prop.value)) {
          trigger = prop.value.value;
        } else if (t.isArrowFunctionExpression(prop.value)) {
          // Extract statusUpdate mutations and return value
          const mutations = extractStatusUpdate(prop.value);
          const returnVal = extractReturn(prop.value);

          if (returnVal === "status") {
            // STATUS trampoline: flatten it
            showStatus = true;
            if (mutations) {
              const nextStep = mutations.nextStep as string | undefined;
              if (nextStep) {
                trigger = nextStep;
                delete mutations.nextStep;
              }
              stateMutations = mutations;
            }
          } else if (returnVal) {
            trigger = returnVal;
            if (mutations) {
              delete mutations.nextStep;
              if (Object.keys(mutations).length > 0) {
                stateMutations = mutations;
              }
            }
          }
        }
        break;
    }
  }

  if (!value && !label) return null;

  return { value, label: label || value, trigger, stateMutations, showStatus };
}

// ---- Main Conversion Entry ----

export function convertConversation(sourceFile: string): StoryGraph {
  const source = readFileSync(sourceFile, "utf-8");

  const ast = parse(source, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  // Find all top-level const array declarations
  const arrays: Record<string, t.ArrayExpression> = {};

  traverse(ast, {
    VariableDeclaration(path: any) {
      // Only process top-level declarations
      if (path.parent.type !== "Program") return;

      for (const decl of path.node.declarations) {
        if (t.isIdentifier(decl.id) && t.isArrayExpression(decl.init)) {
          if (ARRAY_NAMES.includes(decl.id.name)) {
            arrays[decl.id.name] = decl.init;
          }
        }
      }
    },
  });

  console.log(`Found arrays: ${Object.keys(arrays).join(", ")}`);

  // Process all nodes from all arrays
  const nodes: Record<string, RawNode> = {};
  const arrayOrder = ["IMPERSONATION", "EMOTION", "POLARIZATION", "CONSPIRACY", "DISCREDIT", "TROLLING", "ALL_DONE"];

  for (const name of arrayOrder) {
    const arr = arrays[name];
    if (!arr) {
      console.warn(`  Warning: Array ${name} not found`);
      continue;
    }

    let count = 0;
    for (const elem of arr.elements) {
      if (!elem || !t.isObjectExpression(elem)) continue;
      const node = processStep(elem);
      if (node) {
        nodes[node.id] = node;
        count++;
      }
    }
    console.log(`  ${name}: ${count} nodes`);
  }

  // Remove the STATUS trampoline node (it's been flattened into choice options)
  delete nodes["status"];

  // Build chapter metadata
  const chapters = CHAPTER_ORDER.map((id) => {
    const label = id.toUpperCase();
    const prefix = id === "trolling" ? "tr" : id.substring(0, id.length > 3 ? undefined : undefined);

    // Find entry node (first node with matching prefix)
    const entryNodeId = `${id}_1`;

    return {
      id,
      label,
      entryNodeId: nodes[entryNodeId] ? entryNodeId : `${id.substring(0, 2)}_1`,
      badge: {
        image: "",
        type: label,
        content: "",
      },
    };
  });

  const graph: StoryGraph = {
    version: "1.0",
    entryNodeId: "impersonation_1",
    chapters,
    nodes,
  };

  // Stats
  const messageCount = Object.values(nodes).filter((n) => n.type === "message").length;
  const choiceCount = Object.values(nodes).filter((n) => n.type === "choice").length;
  const componentCount = Object.values(nodes).filter((n) => n.type === "component").length;
  const statusTriggers = Object.values(nodes)
    .filter((n) => n.type === "choice")
    .flatMap((n) => n.options ?? [])
    .filter((o) => o.showStatus).length;

  console.log(`\nTotal: ${Object.keys(nodes).length} nodes (${messageCount} messages, ${choiceCount} choices, ${componentCount} components)`);
  console.log(`Status triggers flattened: ${statusTriggers}`);

  return graph;
}

// ---- CLI Entry ----
if (process.argv[1]?.endsWith("parse-conversation.ts") || process.argv[1]?.endsWith("parse-conversation.js")) {
  if (!process.argv[2]) {
    console.error("Usage: tsx src/conversion/parse-conversation.ts <path-to-conversation.js>");
    process.exit(1);
  }
  const sourceFile = resolve(process.argv[2]);
  const outputFile = resolve(__dirname, "../data/story-graph.json");

  console.log(`Parsing: ${sourceFile}`);
  const graph = convertConversation(sourceFile);

  writeFileSync(outputFile, JSON.stringify(graph, null, 2), "utf-8");
  console.log(`\nWritten to: ${outputFile}`);
}
