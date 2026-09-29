import { createHash } from "node:crypto";

/** Hex characters kept, as for source hashes in lock files (DESIGN.md §13). */
const HASH_LENGTH = 16;

/**
 * A short hash of section or doc text, exactly as written. `read_section` returns it, and
 * `write_section` requires it back, so a write never lands on text the AI didn't read
 * (ROADMAP.md Phase 3, PR 3 decision 4).
 */
export function sectionHash( text: string ): string {
	return createHash( "sha256" ).update( text, "utf8" ).digest( "hex" ).slice( 0, HASH_LENGTH );
}
