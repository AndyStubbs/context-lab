import { describe, expect, it } from "vitest";
import {
	isReservedDocPath,
	lockPathFor,
	manifestPathFor
} from "../../../src/core/manifest/manifest-paths.js";

describe( "manifest paths", () => {

	it( "mirrors the doc path under .docctx/, keeping its extension", () => {

		expect( manifestPathFor( "docs/auth/overview.md" ) ).toBe( ".docctx/docs/auth/overview.md.yaml" );
		expect( lockPathFor( "docs/auth/overview.md" ) ).toBe( ".docctx/docs/auth/overview.md.lock" );
		expect( manifestPathFor( "api.yaml" ) ).toBe( ".docctx/api.yaml.yaml" );
	} );

	it( "reserves paths that would collide with ContextLabs' own files", () => {

		expect( isReservedDocPath( "workspace" ) ).toBe( true );
		expect( isReservedDocPath( ".history/notes.md" ) ).toBe( true );
		expect( isReservedDocPath( ".docctx/notes.md" ) ).toBe( true );
		expect( isReservedDocPath( "." ) ).toBe( true );
	} );

	it( "allows similar paths that don't collide", () => {

		expect( isReservedDocPath( "workspace.md" ) ).toBe( false );
		expect( isReservedDocPath( "docs/workspace" ) ).toBe( false );
		expect( isReservedDocPath( "docs/.history/notes.md" ) ).toBe( false );
		expect( isReservedDocPath( ".historical.md" ) ).toBe( false );
	} );
} );
