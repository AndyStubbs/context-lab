import { expect } from "vitest";
import { ManifestError } from "../../src/core/yaml/manifest-error.js";

/** An issue without its file, for compact assertions. */
export interface IssueAt {
	readonly line: number;
	readonly column: number;
	readonly message: string;
}

/**
 * Awaits `pending`, expects it to reject with a `ManifestError`, and returns its issues
 * without the file path.
 */
export async function issuesOf( pending: Promise<unknown> ): Promise<readonly IssueAt[]> {

	let caught: unknown;
	try {
		await pending;
	} catch( error ) {
		caught = error;
	}
	expect( caught ).toBeInstanceOf( ManifestError );
	if( !( caught instanceof ManifestError ) ) {
		return [];
	}
	return caught.issues.map( ( issue ) => ( {
		"line": issue.line,
		"column": issue.column,
		"message": issue.message
	} ) );
}
