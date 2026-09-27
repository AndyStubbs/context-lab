/** Why a file is in scope: as authoritative material, or as supporting material (§9). */
export type ScopeRole = "source" | "context";

/**
 * A pattern and the rule it came from. `rule` is the dotted manifest field, such as
 * `defaults.context` or `sections.token-refresh.sources`.
 */
export interface ScopeReason {
	readonly rule: string;
	readonly pattern: string;
}

/**
 * Inherited patterns dropped by a narrower rule: section `sources`, or a `{ replace: [...] }`.
 */
export interface ReplacedRule {
	readonly rule: string;
	readonly by: string;
}

/** A file in the resolved scope. */
export interface ScopeEntry {

	/** Workspace-relative, with forward slashes. */
	readonly path: string;
	readonly role: ScopeRole;
	readonly sizeBytes: number;

	/** Every pattern that matched the file, sources first, in merge order. */
	readonly reasons: readonly ScopeReason[];
}

/** Why a matched file was left out. */
export type ExclusionReason =
	| { readonly kind: "pattern"; readonly rule: string; readonly pattern: string }
	| { readonly kind: "type-rule"; readonly rule: string; readonly type: string; readonly status: string }
	| { readonly kind: "untracked-status"; readonly manifest: string }
	| { readonly kind: "outside-workspace" };

/** A file that an include pattern matched but a later rule removed (§9 steps 4 and 5). */
export interface ExcludedEntry {
	readonly path: string;

	/** The role it would have had. */
	readonly role: ScopeRole;
	readonly reasons: readonly ScopeReason[];
	readonly excludedBy: ExclusionReason;
}

/** Something in the scope the user should look at. None of them stop resolution. */
export type ScopeWarning =
	| { readonly kind: "no-match"; readonly rule: string; readonly pattern: string }
	| { readonly kind: "over-budget"; readonly totalBytes: number; readonly maxBytes: number }
	| { readonly kind: "unreadable-manifest"; readonly manifest: string; readonly message: string };

/**
 * The files in scope for a doc or section, and why each file is in or out (DESIGN.md §9).
 */
export interface ResolvedScope {
	readonly doc: string;
	readonly section?: string;

	/** Sorted by path. */
	readonly sources: readonly ScopeEntry[];

	/** Sorted by path; never contains a file that is also a source. */
	readonly context: readonly ScopeEntry[];

	/** Sorted by path. */
	readonly excluded: readonly ExcludedEntry[];
	readonly replaced: readonly ReplacedRule[];

	/** Sources plus context. */
	readonly totalBytes: number;
	readonly warnings: readonly ScopeWarning[];
}
