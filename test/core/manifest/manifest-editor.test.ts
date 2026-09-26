import { describe, expect, it } from "vitest";
import { ManifestEditor } from "../../../src/core/manifest/manifest-editor.js";
import type { ScopeChange } from "../../../src/core/manifest/scope-change.js";
import { YamlFile } from "../../../src/core/yaml/yaml-file.js";
import { diffLines } from "../../helpers/line-diff.js";

const FILE = ".docctx/docs/auth/overview.md.yaml";

/** A hand-edited manifest in the canonical style: single-space comments, indented lists. */
const COMMENTED = [
	"# Auth overview: keep sources narrow",
	"doc: docs/auth/overview.md",
	"type: reference",
	"status: review",
	"audience: integrators",
	"",
	"# Authoritative facts",
	"sources: # the doc may only claim what these support",
	"  - src/auth/**",
	"  - \"specs/auth-v2.md\" # quoted on purpose",
	"context: # style and framing",
	"  - docs/auth/tokens.md",
	"exclude:",
	"  - plans/**",
	"",
	"sections:",
	"  token-refresh: # the tricky one",
	"    sources: [src/auth/refresh.ts]",
	"    verified:",
	"      at: 2026-09-25T14:02:00Z",
	"      by: ai",
	"      note: \"Rename only; no documented behavior changed.\"",
	"  error-codes:",
	"    sources: [src/auth/errors.ts]",
	"    context: [docs/_error-format.md]",
	""
].join( "\n" );

function edit( text: string, change: ScopeChange ): { readonly text: string; readonly changed: boolean } {

	const editor = ManifestEditor.edit( YamlFile.parse( FILE, text ) );
	const changed = editor.applyScopeChange( change );
	return { "text": editor.toString(), "changed": changed };
}

describe( "ManifestEditor", () => {

	it( "rewrites an unchanged manifest byte for byte", () => {

		const editor = ManifestEditor.edit( YamlFile.parse( FILE, COMMENTED ) );
		expect( editor.toString() ).toBe( COMMENTED );
	} );

	it( "leaves the parsed file untouched", () => {

		const file = YamlFile.parse( FILE, COMMENTED );
		ManifestEditor.edit( file ).applyScopeChange( { "sources": [ "src/**" ] } );
		expect( file.document.toJS() ).toMatchObject( { "sources": [ "src/auth/**", "specs/auth-v2.md" ] } );
	} );

	describe( "round trips change only the edited lines", () => {

		it( "adds a doc-level source", () => {

			const result = edit( COMMENTED, { "sources": [ "src/auth/**", "specs/auth-v2.md", "specs/errors.md" ] } );
			expect( result.changed ).toBe( true );
			expect( diffLines( COMMENTED, result.text ) ).toEqual( {
				"removed": [],
				"added": [ "  - specs/errors.md" ]
			} );
		} );

		it( "removes an item, keeping the comments on the others", () => {

			const result = edit( COMMENTED, { "sources": [ "specs/auth-v2.md" ] } );
			expect( diffLines( COMMENTED, result.text ) ).toEqual( {
				"removed": [ "  - src/auth/**" ],
				"added": []
			} );
		} );

		it( "reorders items", () => {

			const result = edit( COMMENTED, { "sources": [ "specs/auth-v2.md", "src/auth/**" ] } );
			expect( result.text ).toContain(
				"sources: # the doc may only claim what these support\n" +
				"  - \"specs/auth-v2.md\" # quoted on purpose\n" +
				"  - src/auth/**\n"
			);
		} );

		it( "changes a section's inline list", () => {

			const result = edit( COMMENTED, {
				"section": "token-refresh",
				"sources": [ "src/auth/refresh.ts", "src/auth/clock.ts" ]
			} );
			expect( diffLines( COMMENTED, result.text ) ).toEqual( {
				"removed": [ "    sources: [src/auth/refresh.ts]" ],
				"added": [ "    sources: [src/auth/refresh.ts, src/auth/clock.ts]" ]
			} );
		} );

		it( "adds a field to a section before its verification record", () => {

			const result = edit( COMMENTED, { "section": "token-refresh", "exclude": [ "src/auth/legacy/**" ] } );
			expect( diffLines( COMMENTED, result.text ) ).toEqual( {
				"removed": [],
				"added": [ "    exclude: [src/auth/legacy/**]" ]
			} );
			expect( result.text ).toContain(
				"    sources: [src/auth/refresh.ts]\n    exclude: [src/auth/legacy/**]\n    verified:\n"
			);
		} );

		it( "adds a new section at the end", () => {

			const result = edit( COMMENTED, { "section": "scopes", "sources": [ "src/auth/scopes.ts" ] } );
			expect( diffLines( COMMENTED, result.text ) ).toEqual( {
				"removed": [],
				"added": [ "  scopes:", "    sources: [src/auth/scopes.ts]" ]
			} );
		} );

		it( "removes a doc-level field with its comment", () => {

			const result = edit( COMMENTED, { "context": null } );
			expect( diffLines( COMMENTED, result.text ) ).toEqual( {
				"removed": [ "context: # style and framing", "  - docs/auth/tokens.md" ],
				"added": []
			} );
		} );
	} );

	it( "reports no change when the values are already set", () => {

		const docLevel = edit( COMMENTED, {
			"sources": [ "src/auth/**", "specs/auth-v2.md" ],
			"exclude": [ "plans/**" ]
		} );
		expect( docLevel.changed ).toBe( false );
		expect( docLevel.text ).toBe( COMMENTED );

		const section = edit( COMMENTED, {
			"section": "error-codes",
			"sources": [ "src/auth/errors.ts" ],
			"context": [ "docs/_error-format.md" ]
		} );
		expect( section.changed ).toBe( false );
	} );

	it( "reports no change when removing something absent", () => {

		expect( edit( COMMENTED, { "section": "error-codes", "exclude": null } ).changed ).toBe( false );
		expect( edit( COMMENTED, { "section": "missing", "sources": null } ).changed ).toBe( false );
	} );

	it( "switches context between a list and the replace form, keeping the key comment", () => {

		const replaced = edit( COMMENTED, { "context": { "replace": [ "docs/_style.md" ] } } );
		expect( replaced.text ).toContain( "context: # style and framing\n  replace:\n    - docs/_style.md\nexclude:" );

		const listed = edit( replaced.text, { "context": [ "docs/auth/tokens.md" ] } );
		expect( listed.text ).toBe( COMMENTED );
	} );

	it( "writes the replace form inline in sections", () => {

		const result = edit( COMMENTED, { "section": "error-codes", "context": { "replace": [] } } );
		expect( result.text ).toContain( "    context: {replace: []}\n" );
	} );

	it( "updates the list inside an existing replace form", () => {

		const text = COMMENTED.replace( "    context: [docs/_error-format.md]", "    context: {replace: [a.md]}" );
		const result = edit( text, { "section": "error-codes", "context": { "replace": [ "a.md", "b.md" ] } } );
		expect( result.text ).toContain( "    context: {replace: [a.md, b.md]}\n" );
	} );

	it( "removes a section left empty, and sections when none are left", () => {

		const text = [
			"doc: docs/a.md",
			"type: guide",
			"status: draft",
			"",
			"sources:",
			"  - src/**",
			"",
			"sections:",
			"  setup:",
			"    sources: [src/setup.ts]",
			""
		].join( "\n" );
		const result = edit( text, { "section": "setup", "sources": null } );
		expect( result.text ).toBe( "doc: docs/a.md\ntype: guide\nstatus: draft\n\nsources:\n  - src/**\n" );
	} );

	it( "keeps a blank line before the group when its first key is removed", () => {

		const result = edit( COMMENTED, { "sources": null } );
		expect( result.text ).toContain( "audience: integrators\n\ncontext: # style and framing\n" );
	} );

	it( "turns an empty inline section into a block", () => {

		const text = "doc: docs/a.md\ntype: guide\nstatus: draft\nsections:\n  setup: {}\n";
		const result = edit( text, { "section": "setup", "sources": [ "src/setup.ts" ] } );
		expect( result.text ).toBe(
			"doc: docs/a.md\ntype: guide\nstatus: draft\nsections:\n  setup:\n    sources: [src/setup.ts]\n"
		);
	} );

	it( "writes a long list added to an empty inline section as a block", () => {

		const text = "doc: docs/a.md\ntype: guide\nstatus: draft\nsections:\n  setup: {}\n";
		const patterns = [ "src/auth/refresh/**", "src/auth/tokens/**", "src/auth/sessions/**", "src/auth/errors/**" ];
		const result = edit( text, { "section": "setup", "sources": patterns } );
		expect( result.text ).toContain( "  setup:\n    sources:\n      - src/auth/refresh/**\n" );
	} );

	it( "writes a long section list as a block", () => {

		const patterns = [ "src/auth/refresh/**", "src/auth/tokens/**", "src/auth/sessions/**", "src/auth/errors/**" ];
		const result = edit( COMMENTED, { "section": "scopes", "sources": patterns } );
		const items = patterns.map( ( pattern ) => `      - ${pattern}\n` ).join( "" );
		expect( result.text ).toContain( `  scopes:\n    sources:\n${items}` );
	} );

	it( "quotes patterns that need it", () => {

		const result = edit( COMMENTED, { "exclude": [ "**/drafts/**", "#tmp/**" ] } );
		expect( result.text ).toContain( "exclude:\n  - \"**/drafts/**\"\n  - \"#tmp/**\"\n" );
	} );

	it( "inserts scope fields in canonical order, after plan fields that come first", () => {

		const text = [
			"doc: plans/auth-v2.md",
			"type: plan",
			"status: decided",
			"decided_on: 2026-09-01",
			"",
			"sources:",
			"  - specs/auth-v2.md",
			"implements_into:",
			"  - docs/auth/overview.md",
			""
		].join( "\n" );
		const result = edit( text, { "exclude": [ "plans/archive/**" ] } );
		expect( diffLines( text, result.text ) ).toEqual( {
			"removed": [],
			"added": [ "exclude:", "  - plans/archive/**" ]
		} );
		expect( result.text ).toContain( "  - specs/auth-v2.md\nexclude:\n  - plans/archive/**\nimplements_into:" );
	} );

	it( "normalizes the spacing of aligned trailing comments", () => {

		// The accepted cost of the Document API: comments survive, but their column doesn't
		const text = "doc: docs/a.md\ntype: guide\nstatus: draft\nsources:      # facts\n  - src/**\n";
		const result = edit( text, { "sources": [ "src/**", "lib/**" ] } );
		expect( diffLines( text, result.text ) ).toEqual( {
			"removed": [ "sources:      # facts" ],
			"added": [ "sources: # facts", "  - lib/**" ]
		} );
	} );

	describe( "create", () => {

		it( "lays out a new manifest like DESIGN.md §9", () => {

			const editor = ManifestEditor.create( "docs/auth/overview.md", {
				"type": "reference",
				"status": "draft",
				"audience": "integrators"
			} );
			editor.applyScopeChange( { "sources": [ "src/auth/**" ], "context": [ "docs/auth/tokens.md" ] } );
			editor.applyScopeChange( { "section": "token-refresh", "sources": [ "src/auth/refresh.ts" ] } );
			expect( editor.toString() ).toBe( [
				"doc: docs/auth/overview.md",
				"type: reference",
				"status: draft",
				"audience: integrators",
				"",
				"sources:",
				"  - src/auth/**",
				"context:",
				"  - docs/auth/tokens.md",
				"",
				"sections:",
				"  token-refresh:",
				"    sources: [src/auth/refresh.ts]",
				""
			].join( "\n" ) );
		} );

		it( "writes just the header when no scope is given", () => {

			const fields = { "type": "guide", "status": "draft", "owner": "docs team" };
			const editor = ManifestEditor.create( "docs/a.md", fields );
			expect( editor.toString() ).toBe( "doc: docs/a.md\ntype: guide\nstatus: draft\nowner: docs team\n" );
		} );
	} );
} );
