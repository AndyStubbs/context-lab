/**
 * A doc type and its lifecycle (DESIGN.md §11).
 */
export interface DocType {

	/** In lifecycle order; never empty. */
	readonly statuses: readonly string[];

	/** Statuses at which docs of this type are dropped from other docs' scope (§9 step 5). */
	readonly exclude_from_context_when: readonly string[];
}

/**
 * A term the terminology check reports, and the term to use instead (DESIGN.md §8).
 */
export interface BannedTerm {
	readonly term: string;
	readonly prefer: string;
}

export interface Glossary {

	/** Workspace-relative, normalized. */
	readonly file?: string;
	readonly banned_terms: readonly BannedTerm[];
}

export interface WorkspaceDefaults {

	/** Glob patterns, as written. */
	readonly context: readonly string[];

	/** Glob patterns, as written. */
	readonly exclude: readonly string[];
}

export interface WorkspaceSettings {
	readonly hash_algorithm: string;
	readonly max_context_bytes: number;
	readonly max_diff_bytes: number;
}

/**
 * `.docctx/workspace.yaml` with defaults filled in (DESIGN.md §8). Field names are the wire
 * names.
 */
export interface WorkspaceConfig {
	readonly version: 1;
	readonly defaults: WorkspaceDefaults;

	/** In the order written. The §11 defaults when the file defines no types. */
	readonly types: ReadonlyMap<string, DocType>;
	readonly glossary?: Glossary;
	readonly settings: WorkspaceSettings;
}
