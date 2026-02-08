import type { GameState } from "./types.js";

/**
 * Replace all {{variable}} placeholders in a template string with values from game state.
 * Unresolved placeholders are left as-is.
 */
export function interpolate(template: string, state: GameState): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (state as Record<string, unknown>)[key];
    if (value != null && value !== "") {
      return String(value);
    }
    return `{{${key}}}`;
  });
}

/**
 * Recursively interpolate all string values in a props object.
 */
export function interpolateProps(
  props: Record<string, unknown>,
  state: GameState,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") {
      result[key] = interpolate(value, state);
    } else {
      result[key] = value;
    }
  }
  return result;
}
