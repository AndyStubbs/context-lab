/**
 * A section of a markdown doc: a heading and everything below it until the next heading of
 * the same or higher level (DESIGN.md §10).
 */
export interface Section {

	/** Unique within the doc: the slug, or a parent path such as `setup/install` (§10). */
	readonly key: string;

	/** GitHub-style slug of the heading text. */
	readonly slug: string;

	/** The heading's plain text. */
	readonly title: string;

	/** Heading level, 1 to 6. */
	readonly depth: number;

	/** 1-based line of the heading. */
	readonly startLine: number;

	/** 1-based last line of the section, including its subsections. */
	readonly endLine: number;

	/** Key of the enclosing section, if any. */
	readonly parentKey?: string;
}

/**
 * Something about a doc's headings the user should know, such as a key that depends on
 * heading order.
 */
export interface OutlineWarning {
	readonly line: number;
	readonly message: string;
}

/**
 * The sections of one doc. Docs that aren't markdown are a single unit with no sections
 * (DESIGN.md §10).
 */
export interface DocOutline {

	/** Normalized workspace-relative doc path. */
	readonly doc: string;
	readonly kind: "markdown" | "single";

	/** In document order; empty for a single-unit doc. */
	readonly sections: readonly Section[];
	readonly warnings: readonly OutlineWarning[];
	readonly lineCount: number;
}
