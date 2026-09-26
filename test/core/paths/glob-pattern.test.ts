import { describe, expect, it } from "vitest";
import { checkGlobPattern } from "../../../src/core/paths/glob-pattern.js";
import type { PathRejectionReason } from "../../../src/core/paths/path-outside-workspace-error.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";

function rejectionOf( pattern: string ): PathRejectionReason | undefined {

	try {
		checkGlobPattern( pattern );
	} catch( error ) {
		if( error instanceof PathOutsideWorkspaceError ) {
			return error.reason;
		}
		throw error;
	}
	return undefined;
}

describe( "checkGlobPattern", () => {

	it( "accepts workspace-relative patterns", () => {

		expect( rejectionOf( "src/auth/**" ) ).toBeUndefined();
		expect( rejectionOf( "**/node_modules/**" ) ).toBeUndefined();
		expect( rejectionOf( "docs/_style.md" ) ).toBeUndefined();
		expect( rejectionOf( "docs/..notes.md" ) ).toBeUndefined();
		expect( rejectionOf( "src/\\*literal.ts" ) ).toBeUndefined();
	} );

	it( "rejects absolute patterns on any platform", () => {

		expect( rejectionOf( "/etc/**" ) ).toBe( "absolute" );
		expect( rejectionOf( "C:x" ) ).toBe( "absolute" );
		expect( rejectionOf( "C:/src/**" ) ).toBe( "absolute" );
	} );

	it( "rejects patterns with a .. segment", () => {

		expect( rejectionOf( "../x" ) ).toBe( "escapes-root" );
		expect( rejectionOf( "a/../../x" ) ).toBe( "escapes-root" );
		expect( rejectionOf( "src/**/.." ) ).toBe( "escapes-root" );
	} );

	it( "rejects empty and negated patterns", () => {

		expect( rejectionOf( "" ) ).toBe( "invalid" );
		expect( rejectionOf( "!src/**" ) ).toBe( "invalid" );
		expect( rejectionOf( "a\0b" ) ).toBe( "invalid" );
	} );
} );
