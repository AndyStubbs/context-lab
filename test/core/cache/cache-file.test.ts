import { describe, expect, it } from "vitest";
import { parseCacheFile, serializeCacheFile } from "../../../src/core/cache/cache-file.js";

const ENTRY = {
	"size": 5,
	"mtime_ms": 1700000000000.5,
	"ctime_ms": 1700000000001.25,
	"ino": 42,
	"hash": "ab12",
	"hashed_at_ms": 1700000005000
};

function text( fields: Record<string, unknown> ): string {
	return JSON.stringify( { "format_version": 1, "hash_algorithm": "sha256", "files": { "a.md": ENTRY }, ...fields } );
}

describe( "parseCacheFile", () => {

	it( "accepts a valid file and round-trips it exactly", () => {

		const parsed = parseCacheFile( text( {} ), "sha256" );
		expect( parsed?.files ).toEqual( { "a.md": ENTRY } );
		const again = serializeCacheFile( "sha256", new Map( Object.entries( parsed?.files ?? {} ) ) );
		expect( parseCacheFile( again, "sha256" ) ).toEqual( parsed );
	} );

	it( "rejects anything it can't trust", () => {

		const cases: Record<string, string> = {
			"garbage": "\u0000ÿ not json",
			"empty": "",
			"null": "null",
			"array": "[]",
			"other version": text( { "format_version": 99 } ),
			"no files": text( { "files": undefined } ),
			"wrong field type": text( { "files": { "a.md": ENTRY, "b.md": { ...ENTRY, "size": "5" } } } ),
			"negative size": text( { "files": { "a.md": { ...ENTRY, "size": -1 } } } ),
			"missing field": text( { "files": { "a.md": { ...ENTRY, "ino": undefined } } } ),
			"non-hex hash": text( { "files": { "a.md": { ...ENTRY, "hash": "XYZ" } } } )
		};
		for( const [ name, value ] of Object.entries( cases ) ) {
			expect( parseCacheFile( value, "sha256" ), name ).toBeUndefined();
		}
		expect( parseCacheFile( text( {} ), "sha512" ) ).toBeUndefined();
	} );

	it( "sorts paths when serializing", () => {

		const files = new Map( [ [ "b.md", ENTRY ], [ "A.md", ENTRY ], [ "a.md", ENTRY ] ] );
		const serialized = serializeCacheFile( "sha256", files );
		const parsed = JSON.parse( serialized ) as { files: object };
		expect( Object.keys( parsed.files ) ).toEqual( [ "A.md", "a.md", "b.md" ] );
		expect( serialized.endsWith( "}\n" ) ).toBe( true );
	} );
} );
