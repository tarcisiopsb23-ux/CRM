/**
 * Replaces all {{variable_name}} markers in the template string with values
 * from the vars map. Variables not found in the map are replaced with ""
 * and recorded in the `unresolved` array.
 *
 * Property 8: after substitution, the output contains no remaining {{...}} patterns.
 */
export function resolveVariables(
  template: string,
  vars: Record<string, string>
): { output: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const VARIABLE_PATTERN = /\{\{([a-z_]{1,50})\}\}/g;
  const output = template.replace(VARIABLE_PATTERN, (_match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name];
    }
    unresolved.push(name);
    return '';
  });
  return { output, unresolved };
}
