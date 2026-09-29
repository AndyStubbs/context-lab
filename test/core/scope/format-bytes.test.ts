import { describe, expect, it } from "vitest";
import { formatBytes } from "../../../src/core/scope/format-bytes.js";

describe( "formatBytes", () => {

	it( "uses 1000-based units with at most one decimal", () => {

		expect( formatBytes( 0 ) ).toBe( "0 B" );
		expect( formatBytes( 999 ) ).toBe( "999 B" );
		expect( formatBytes( 1000 ) ).toBe( "1 KB" );
		expect( formatBytes( 1500 ) ).toBe( "1.5 KB" );
		expect( formatBytes( 1049 ) ).toBe( "1 KB" );
		expect( formatBytes( 200000 ) ).toBe( "200 KB" );
		expect( formatBytes( 999999 ) ).toBe( "1 MB" );
		expect( formatBytes( 1234567 ) ).toBe( "1.2 MB" );
	} );
} );
