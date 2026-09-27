import { describe, expect, it } from "vitest";
import { formatBytes } from "../../src/cli/format-bytes.js";
import { formatScope } from "../../src/cli/format-scope.js";
import type { ResolvedScope } from "../../src/core/scope/resolved-scope.js";

const EMPTY: ResolvedScope = {
	"doc": "docs/a.md",
	"sources": [],
	"context": [],
	"excluded": [],
	"replaced": [],
	"totalBytes": 0,
	"warnings": []
};

describe( "formatScope", () => {

	it( "prints only the heading and summary for an empty scope", () => {
		expect( formatScope( EMPTY, 200000 ) ).toBe( "docs/a.md\n0 sources, 0 context files, 0 B of 200 KB\n" );
	} );

	it( "explains every kind of exclusion", () => {

		const reason = { "rule": "sources", "pattern": "**" };
		const text = formatScope( {
			...EMPTY,
			"excluded": [
				{
					"path": "a.md",
					"role": "source",
					"reasons": [ reason ],
					"excludedBy": { "kind": "outside-workspace" }
				},
				{
					"path": "plans/maybe.md",
					"role": "context",
					"reasons": [ reason, { "rule": "context", "pattern": "plans/**" } ],
					"excludedBy": { "kind": "untracked-status", "manifest": ".docctx/plans/maybe.md.yaml" }
				}
			]
		}, 200000 );
		expect( text ).toContain( [
			"Excluded",
			"  a.md            leads outside the workspace",
			"                  matched by sources: **",
			"  plans/maybe.md  status unknown: .docctx/plans/maybe.md.yaml is invalid",
			"                  matched by sources: **",
			"                  matched by context: plans/**",
			""
		].join( "\n" ) );
	} );

	it( "explains every kind of warning", () => {

		const text = formatScope( {
			...EMPTY,
			"totalBytes": 250000,
			"warnings": [
				{ "kind": "no-match", "rule": "sections.a.sources", "pattern": "src/gone.ts" },
				{ "kind": "over-budget", "totalBytes": 250000, "maxBytes": 200000 },
				{
					"kind": "unreadable-manifest",
					"manifest": ".docctx/plans/maybe.md.yaml",
					"message": ".docctx/plans/maybe.md.yaml:1:1: missing required field `status`\n" +
						".docctx/plans/maybe.md.yaml:2:1: unknown field `stauts`"
				}
			]
		}, 200000 );
		expect( text ).toContain( "0 sources, 0 context files, 250 KB of 200 KB\n" );
		expect( text ).toContain( [
			"Warnings",
			"  sections.a.sources: src/gone.ts matched no files",
			"  scope is 250 KB, over max_context_bytes (200 KB)",
			"  .docctx/plans/maybe.md.yaml is invalid, so its doc was left out:",
			"    .docctx/plans/maybe.md.yaml:1:1: missing required field `status`",
			"    .docctx/plans/maybe.md.yaml:2:1: unknown field `stauts`",
			""
		].join( "\n" ) );
	} );

	it( "uses singular nouns for one file", () => {

		const entry = { "sizeBytes": 1, "reasons": [ { "rule": "sources", "pattern": "a" } ] };
		const text = formatScope( {
			...EMPTY,
			"sources": [ { ...entry, "path": "a", "role": "source" } ],
			"context": [ { ...entry, "path": "b", "role": "context" } ],
			"totalBytes": 2
		}, 1000 );
		expect( text.split( "\n" )[ 1 ] ).toBe( "1 source, 1 context file, 2 B of 1 KB" );
	} );
} );

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
