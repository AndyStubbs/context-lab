/** Who made a verification decision (DESIGN.md §13). */
export type VerifiedBy = "human" | "ai";

/** How a human decision reached the server (DESIGN.md §13). */
export type VerifiedVia = "elicitation" | "chat";

/**
 * When a section, or a doc without sections, was last verified, and by whom (DESIGN.md §13).
 * The matching source hashes live in the lock file.
 */
export interface VerificationRecord {

	/** RFC 3339 UTC timestamp, as written; it must match the lock file entry's `at`. */
	readonly at: string;
	readonly by: VerifiedBy;

	/** Present exactly when `by` is `human`. */
	readonly via?: VerifiedVia;
	readonly note?: string;
}

/**
 * Glob patterns for `context`: a list merges with inherited context, and `{ replace: [...] }`
 * replaces it (DESIGN.md §9).
 */
export type ContextList = readonly string[] | { readonly replace: readonly string[] };

/**
 * A section's scope overrides and verification record (DESIGN.md §9, §10). Glob patterns are
 * kept as written.
 */
export interface SectionScope {

	/** Replaces the doc-level sources for this section. */
	readonly sources?: readonly string[];
	readonly context?: ContextList;
	readonly exclude?: readonly string[];
	readonly verified?: VerificationRecord;
}

/**
 * A doc manifest, `.docctx/<doc path>.yaml` (DESIGN.md §9). Field names are the wire names.
 * Plain paths are normalized workspace-relative paths; glob patterns are kept as written.
 */
export interface DocManifest {

	/** The doc this manifest describes. Authoritative even if the manifest's path disagrees. */
	readonly doc: string;
	readonly type: string;
	readonly status: string;
	readonly audience?: string;
	readonly owner?: string;
	readonly sources?: readonly string[];
	readonly context?: ContextList;
	readonly exclude?: readonly string[];

	/** Keyed by section slug, in the order written; empty when the manifest has none. */
	readonly sections: ReadonlyMap<string, SectionScope>;

	/** Only for docs without sections. */
	readonly verified?: VerificationRecord;

	/** Plans only. */
	readonly supersedes?: string;

	/** Plans only. */
	readonly implements_into?: readonly string[];

	/** Plans only. `YYYY-MM-DD`. */
	readonly decided_on?: string;
	readonly allow_terms?: readonly string[];
}
