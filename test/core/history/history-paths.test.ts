import { describe, expect, it } from "vitest";
import { historyDirFor, parseVersionNumber, versionFileName } from "../../../src/core/history/history-paths.js";

describe( "history paths", () => {

	it( "mirrors the doc path and nests keys with a parent path", () => {

		expect( historyDirFor( "docs/auth/overview.md", "token-refresh" ) )
			.toBe( ".docctx/.history/docs/auth/overview.md/token-refresh" );
		expect( historyDirFor( "docs/auth/overview.md", "setup/install" ) )
			.toBe( ".docctx/.history/docs/auth/overview.md/setup/install" );
		expect( historyDirFor( "api/openapi.yaml", undefined ) ).toBe( ".docctx/.history/api/openapi.yaml/@doc" );
	} );

	it( "rejects anything that isn't a section key", () => {

		for( const key of [ "", "a//b", "/a", "a/", "../x", "a/@doc", "@doc", "x.y", "a\\b", "a\0b" ] ) {
			expect( () => historyDirFor( "docs/a.md", key ), key ).toThrow( "Not a section key" );
		}
	} );

	it( "names versions with four digits and the doc's extension", () => {

		expect( versionFileName( 3, "docs/a.md" ) ).toBe( "0003.md" );
		expect( versionFileName( 3, "api/openapi.yaml" ) ).toBe( "0003.yaml" );
		expect( versionFileName( 3, "docs/README" ) ).toBe( "0003" );
		expect( versionFileName( 12345, "docs/a.md" ) ).toBe( "12345.md" );
	} );

	it( "parses only canonical version file names for the doc", () => {

		expect( parseVersionNumber( "0003.md", "docs/a.md" ) ).toBe( 3 );
		expect( parseVersionNumber( "12345.md", "docs/a.md" ) ).toBe( 12345 );
		expect( parseVersionNumber( "0003", "docs/README" ) ).toBe( 3 );
		for( const name of [ "12.md", "00003.md", "0000.md", "0001.txt", "abcd.md", "0001.md.tmp", "install" ] ) {
			expect( parseVersionNumber( name, "docs/a.md" ), name ).toBeUndefined();
		}
	} );
} );
