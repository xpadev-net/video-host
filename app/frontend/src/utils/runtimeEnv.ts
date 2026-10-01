/**
 * Container assets keep Vite placeholders until startup substitution. Treat an
 * unresolved placeholder as same-origin during prerender without comparing to
 * the literal placeholder (which env-replacer would also rewrite).
 * Keep this runtime check so replacing the value still selects an explicit API.
 */
export function resolveApiEndpoint(value: string | undefined): string {
  return !value || /^_VITE_[A-Z0-9_]+_$/.test(value) ? "" : value;
}

/** A runtime expression preserves placeholder-backed flags in optimized builds. */
export function resolveRuntimeFlag(value: string | undefined): boolean {
  return /^true$/i.test(value ?? "");
}
