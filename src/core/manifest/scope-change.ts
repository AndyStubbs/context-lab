import type { ContextList } from "./doc-manifest.js";

/**
 * A change to the scope of a doc or one of its sections. A field that is left out stays as it
 * is, `null` removes it, and a value replaces it. Glob patterns are stored as given.
 */
export interface ScopeChange {

	/** Section slug; omit to change the doc-level scope. */
	readonly section?: string;
	readonly sources?: readonly string[] | null;
	readonly context?: ContextList | null;
	readonly exclude?: readonly string[] | null;
}
