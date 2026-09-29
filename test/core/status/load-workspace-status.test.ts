import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { loadWorkspaceStatus } from "../../../src/core/status/load-workspace-status.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import { copyFixture, removeScratch } from "../../helpers/scratch-fixture.js";

let m_scratch: string;
let m_root: WorkspaceRoot;

beforeEach( async () => {

	m_scratch = await copyFixture( "basic" );
	m_root = await WorkspaceRoot.open( m_scratch );
} );

afterEach( async () => {
	await removeScratch( m_scratch );
} );

describe( "loadWorkspaceStatus", () => {

	it( "lists every tracked doc, sorted, with nothing to report", async () => {

		const status = await loadWorkspaceStatus( m_root, await readWorkspaceConfig( m_root ) );
		expect( status.docs.map( ( manifest ) => manifest.doc ) ).toEqual( [
			"docs/auth/overview.md",
			"docs/auth/tokens.md",
			"plans/auth-v2.md"
		] );
		expect( status.problems ).toEqual( [] );
		expect( status.orphanedSections.size ).toBe( 0 );
		expect( status.missingDocs ).toEqual( [] );
	} );

	it( "reports problems, orphaned sections and missing docs without hiding the other docs", async () => {

		await writeFile( path.join( m_scratch, ".docctx/docs/auth/tokens.md.yaml" ), "doc: [not, a, path]\n" );
		await writeFile( path.join( m_scratch, "docs/auth/overview.md" ), "# Overview\n\n## Error codes\n" );
		await rm( path.join( m_scratch, "plans/auth-v2.md" ) );

		const status = await loadWorkspaceStatus( m_root, await readWorkspaceConfig( m_root ) );
		expect( status.docs.map( ( manifest ) => manifest.doc ) )
			.toEqual( [ "docs/auth/overview.md", "plans/auth-v2.md" ] );
		expect( status.problems ).toMatchObject( [
			{ "path": ".docctx/docs/auth/tokens.md.yaml", "doc": "docs/auth/tokens.md" }
		] );
		expect( [ ...status.orphanedSections ] ).toEqual( [ [ "docs/auth/overview.md", [ "token-refresh" ] ] ] );
		expect( status.missingDocs ).toEqual( [ "plans/auth-v2.md" ] );
	} );
} );
