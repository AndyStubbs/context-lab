import { describe, expect, it } from "vitest";
import { sliceLines } from "../../../src/core/sections/slice-lines.js";

describe( "sliceLines", () => {

	it( "returns an inclusive 1-based range with its line endings", () => {
		expect( sliceLines( "a\nb\nc\nd\n", 2, 3 ) ).toBe( "b\nc\n" );
	} );

	it( "keeps CRLF endings whole", () => {
		expect( sliceLines( "a\r\nb\r\nc\r\n", 2, 2 ) ).toBe( "b\r\n" );
	} );

	it( "returns the last line as written when the file has no final newline", () => {
		expect( sliceLines( "a\nb", 1, 2 ) ).toBe( "a\nb" );
	} );
} );
