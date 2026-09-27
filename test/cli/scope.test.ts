import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../src/core/paths/workspace-root.js";
import { loadScope } from "../../src/core/scope/load-scope.js";
import { readWorkspaceConfig } from "../../src/core/workspace/read-workspace-config.js";
import { runDocctx } from "../helpers/cli-run.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../fixtures/scope", import.meta.url ) );

describe( "docctx scope", () => {

	it( "takes paths relative to the current directory", async () => {

		const fromRoot = await runDocctx( FIXTURE_ROOT, "scope", "docs/guide.md", "install" );
		const fromDocs = await runDocctx( path.join( FIXTURE_ROOT, "docs" ), "scope", "guide.md", "install" );
		expect( fromDocs.code ).toBe( 0 );
		expect( fromDocs.stdout ).toBe( fromRoot.stdout );
	} );

	it( "prints the resolved scope as JSON with --json", async () => {

		const result = await runDocctx( FIXTURE_ROOT, "scope", "--json", "docs/guide.md", "configure" );
		const root = await WorkspaceRoot.open( FIXTURE_ROOT );
		const expected = await loadScope( root, await readWorkspaceConfig( root ), "docs/guide.md", "configure" );
		expect( result.code ).toBe( 0 );
		expect( JSON.parse( result.stdout ) ).toEqual( JSON.parse( JSON.stringify( expected ) ) );
	} );

	it( "exits 0 when the scope has warnings", async () => {

		const result = await runDocctx( FIXTURE_ROOT, "scope", "docs/guide.md" );
		expect( result.code ).toBe( 0 );
		expect( result.stdout ).toContain( "sources: specs/missing.md matched no files" );
		expect( result.stderr ).toBe( "" );
	} );

	it( "exits 1 with the reason on stderr for an untracked doc or unknown section", async () => {

		const untracked = await runDocctx( FIXTURE_ROOT, "scope", "docs/_style.md" );
		expect( untracked ).toEqual( {
			"code": 1,
			"stdout": "",
			"stderr": "docctx: Doc is not tracked (it has no manifest): \"docs/_style.md\"\n"
		} );

		const section = await runDocctx( FIXTURE_ROOT, "scope", "docs/guide.md", "uninstall" );
		expect( section.code ).toBe( 1 );
		expect( section.stderr ).toBe( "docctx: docs/guide.md has no section \"uninstall\"\n" );

		const single = await runDocctx( FIXTURE_ROOT, "scope", "api/openapi.yaml", "info" );
		expect( single.stderr ).toBe( "docctx: api/openapi.yaml is not markdown, so it has no sections\n" );
	} );

	it( "exits 1 for a path outside the workspace", async () => {

		const result = await runDocctx( path.join( FIXTURE_ROOT, "docs" ), "scope", "../../basic/docs/auth/tokens.md" );
		expect( result.code ).toBe( 1 );
		expect( result.stderr ).toContain( "outside the workspace" );
	} );

	it( "exits 2 without a doc argument", async () => {

		const result = await runDocctx( FIXTURE_ROOT, "scope" );
		expect( result.code ).toBe( 2 );
		expect( result.stderr ).toContain( "missing required argument 'doc'" );
	} );

	describe( "in a scratch folder", () => {

		let m_sandbox: string;

		beforeEach( async () => {
			m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-cli-" ) ) );
		} );

		afterEach( async () => {
			await rm( m_sandbox, { "recursive": true, "force": true } );
		} );

		it( "exits 1 with every issue when the doc's manifest is invalid", async () => {

			await cp( FIXTURE_ROOT, m_sandbox, { "recursive": true } );
			await writeFile(
				path.join( m_sandbox, ".docctx", "docs", "guide.md.yaml" ),
				"doc: docs/guide.md\ntype: tutorial\nstauts: draft\n"
			);
			const result = await runDocctx( m_sandbox, "scope", "docs/guide.md" );
			expect( result.code ).toBe( 1 );
			expect( result.stderr ).toBe( [
				"docctx: .docctx/docs/guide.md.yaml:1:1: missing required field `status`",
				".docctx/docs/guide.md.yaml:2:7: unknown type `tutorial`; " +
					"the workspace defines: reference, guide, plan",
				".docctx/docs/guide.md.yaml:3:1: unknown field `stauts`",
				""
			].join( "\n" ) );
		} );

		it( "exits 1 when no workspace contains the current directory", async () => {

			// Assumes nothing above the system temp directory has a .docctx/ directory
			await mkdir( path.join( m_sandbox, "empty" ) );
			const result = await runDocctx( path.join( m_sandbox, "empty" ), "scope", "a.md" );
			expect( result.code ).toBe( 1 );
			expect( result.stderr ).toMatch( /^docctx: No \.docctx\/ directory found in / );
		} );
	} );
} );
