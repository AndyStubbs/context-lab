import { describe, expect, it } from "vitest";
import type { KeyInput } from "../../../src/core/sections/section-keys.js";
import { assignSectionKeys } from "../../../src/core/sections/section-keys.js";

function keysOf( headings: readonly KeyInput[] ): readonly ( string | undefined )[] {
	return assignSectionKeys( headings ).keys;
}

describe( "assignSectionKeys", () => {

	it( "uses the slug when it is unique", () => {

		expect( keysOf( [
			{ "slug": "overview" },
			{ "slug": "token-refresh", "parent": 0 },
			{ "slug": "error-codes", "parent": 0 }
		] ) ).toEqual( [ "overview", "token-refresh", "error-codes" ] );
	} );

	it( "tells duplicates apart by parent path", () => {

		expect( keysOf( [
			{ "slug": "setup" },
			{ "slug": "install", "parent": 0 },
			{ "slug": "upgrade" },
			{ "slug": "install", "parent": 2 }
		] ) ).toEqual( [ "setup", "setup/install", "upgrade", "upgrade/install" ] );
	} );

	it( "uses the shortest path suffix that is unique", () => {

		// v1/setup/install and v2/setup/install share setup/install, so they need a third segment
		expect( keysOf( [
			{ "slug": "v1" },
			{ "slug": "setup", "parent": 0 },
			{ "slug": "install", "parent": 1 },
			{ "slug": "v2" },
			{ "slug": "setup", "parent": 3 },
			{ "slug": "install", "parent": 4 }
		] ) ).toEqual( [ "v1", "v1/setup", "v1/setup/install", "v2", "v2/setup", "v2/setup/install" ] );
	} );

	it( "lets a top-level duplicate keep the bare slug", () => {

		expect( keysOf( [
			{ "slug": "install" },
			{ "slug": "setup" },
			{ "slug": "install", "parent": 1 }
		] ) ).toEqual( [ "install", "setup", "setup/install" ] );
	} );

	it( "suffixes later headings when the whole path is shared", () => {

		const assignment = assignSectionKeys( [
			{ "slug": "setup" },
			{ "slug": "install", "parent": 0 },
			{ "slug": "install", "parent": 0 },
			{ "slug": "install", "parent": 0 }
		] );
		expect( assignment.keys ).toEqual( [ "setup", "setup/install", "setup/install-1", "setup/install-2" ] );
		expect( assignment.suffixed ).toEqual( [ { "index": 2, "sameAs": 1 }, { "index": 3, "sameAs": 1 } ] );
	} );

	it( "skips suffixed keys that are already in use", () => {

		expect( keysOf( [
			{ "slug": "faq" },
			{ "slug": "faq-1" },
			{ "slug": "faq" }
		] ) ).toEqual( [ "faq", "faq-1", "faq-2" ] );
	} );

	it( "gives no key to a heading without a slug, and leaves it out of paths", () => {

		expect( keysOf( [
			{ "slug": "" },
			{ "slug": "install", "parent": 0 },
			{ "slug": "setup" },
			{ "slug": "install", "parent": 2 }
		] ) ).toEqual( [ undefined, "install", "setup", "setup/install" ] );
	} );
} );
