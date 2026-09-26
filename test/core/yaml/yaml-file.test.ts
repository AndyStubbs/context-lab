import { describe, expect, it } from "vitest";
import { ManifestError } from "../../../src/core/yaml/manifest-error.js";
import { YamlFile } from "../../../src/core/yaml/yaml-file.js";

function parseError( text: string ): ManifestError {

	try {
		YamlFile.parse( ".docctx/x.md.yaml", text );
	} catch( error ) {
		if( error instanceof ManifestError ) {
			return error;
		}
		throw error;
	}
	throw new Error( "expected a ManifestError" );
}

describe( "YamlFile.parse", () => {

	it( "keeps dates and timestamps as strings", () => {

		const file = YamlFile.parse( "f.yaml", "d: 2026-09-01\nt: 2026-09-25T14:02:00Z\n" );
		expect( file.document.toJS() ).toEqual( { "d": "2026-09-01", "t": "2026-09-25T14:02:00Z" } );
	} );

	it( "reports syntax errors with a position", () => {

		const error = parseError( "doc: a\nsources: [a\n" );
		expect( error.issues[ 0 ]?.line ).toBe( 3 );
		expect( error.message ).toMatch( /^\.docctx\/x\.md\.yaml:3:1: / );
	} );

	it( "rejects duplicate keys", () => {

		const error = parseError( "doc: a\ndoc: b\n" );
		expect( error.issues.map( ( issue ) => [ issue.line, issue.column ] ) ).toEqual( [ [ 2, 1 ] ] );
	} );

	it( "rejects multiple documents", () => {
		expect( parseError( "doc: a\n---\ndoc: b\n" ).issues ).toHaveLength( 1 );
	} );

	it( "rejects aliases", () => {

		const error = parseError( "sources: &s [a]\ncontext: *s\n" );
		expect( error.issues ).toEqual( [ {
			"file": ".docctx/x.md.yaml",
			"line": 2,
			"column": 10,
			"message": "anchors and aliases are not supported"
		} ] );
	} );
} );
