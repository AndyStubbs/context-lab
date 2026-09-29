/**
 * Why `write_section` refused to write:
 * - `changed`: the section's text no longer matches the hash it was read with
 * - `has-sections`: a whole-doc write was asked for a doc that has sections
 * - `shape`: the new text doesn't start with a heading at the section's depth, or has another
 *   heading at that depth or higher, so it would change the doc's structure
 * - `orphans`: the new doc would leave manifest section keys matching no heading
 */
export type SectionWriteFailure = "changed" | "has-sections" | "shape" | "orphans";

/**
 * Thrown when a section write is refused (ROADMAP.md Phase 3, PR 3 decisions 1 to 4). Nothing
 * has been written when it is thrown, including section history.
 */
export class SectionWriteError extends Error {

	private readonly m_reason: SectionWriteFailure;

	constructor( reason: SectionWriteFailure, message: string ) {

		super( message );
		this.name = "SectionWriteError";
		this.m_reason = reason;
	}

	get reason(): SectionWriteFailure {
		return this.m_reason;
	}
}
