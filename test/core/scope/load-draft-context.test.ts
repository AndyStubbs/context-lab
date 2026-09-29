import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { loadDraftContext } from "../../../src/core/scope/load-draft-context.js";
import { UntrackedDocError } from "../../../src/core/scope/untracked-doc-error.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import { copyFixture, removeScratch } from "../../helpers/scratch-fixture.js";

const OVERVIEW = "docs/auth/overview.md";

let m_scratch: string;
let m_root: WorkspaceRoot;

beforeEach( async () => {

	m_scratch = await copyFixture( "basic" );
	m_root = await WorkspaceRoot.open( m_scratch );
} );

afterEach( async () => {
	await removeScratch( m_scratch );
} );

async function loadTokenRefresh(): ReturnType<typeof loadDraftContext> {
	return loadDraftContext( m_root, await readWorkspaceConfig( m_root ), OVERVIEW, "token-refresh" );
}

describe( "loadDraftContext", () => {

	it( "loads the section, its resolved scope and every file in it", async () => {

		const context = await loadTokenRefresh();
		expect( context.section.section?.key ).toBe( "token-refresh" );
		expect( context.section.manifest.audience ).toBe( "integrators" );
		expect( context.scope.section ).toBe( "token-refresh" );
		expect( context.files?.map( ( file ) => file.path ) ).toEqual( [
			"src/auth/refresh.ts",
			"docs/_glossary.md",
			"docs/_style.md",
			"docs/auth/tokens.md"
		] );
		expect( context.bannedTerms.map( ( banned ) => banned.term ) ).toEqual( [ "whitelist", "e-mail" ] );
	} );

	it( "leaves out every file when the scope is over max_context_bytes", async () => {

		const configPath = path.join( m_scratch, ".docctx/workspace.yaml" );
		const config = await readFile( configPath, "utf8" );
		await writeFile( configPath, config.replace( "max_context_bytes: 200000", "max_context_bytes: 500" ) );

		const context = await loadTokenRefresh();
		expect( context.files ).toBeUndefined();
		expect( context.scope.sources ).toHaveLength( 1 );
	} );

	it( "drops the banned terms the doc's manifest allows, whatever their case", async () => {

		const manifest = path.join( m_scratch, ".docctx/docs/auth/overview.md.yaml" );
		await writeFile( manifest, `${await readFile( manifest, "utf8" )}allow_terms: [WhiteList]\n` );
		const context = await loadTokenRefresh();
		expect( context.bannedTerms.map( ( banned ) => banned.term ) ).toEqual( [ "e-mail" ] );
	} );

	it( "refuses an untracked doc", async () => {

		await expect( loadDraftContext( m_root, await readWorkspaceConfig( m_root ), "docs/_style.md" ) )
			.rejects.toBeInstanceOf( UntrackedDocError );
	} );
} );
