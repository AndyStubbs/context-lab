import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listManifests } from "../../../src/core/manifest/list-manifests.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );

let m_sandbox: string;
let m_root: WorkspaceRoot;

beforeEach( async () => {

	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-list-" ) ) );
	await cp( FIXTURE_ROOT, m_sandbox, { "recursive": true } );
	m_root = await WorkspaceRoot.open( m_sandbox );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

async function write( relative: string, text: string ): Promise<void> {

	const target = path.join( m_sandbox, ...relative.split( "/" ) );
	await mkdir( path.dirname( target ), { "recursive": true } );
	await writeFile( target, text );
}

describe( "listManifests", () => {

	it( "finds every manifest, keyed by doc, skipping workspace.yaml and .history/", async () => {

		await write( ".docctx/.history/docs/auth/overview.md/token-refresh/0001.yaml", "not: a manifest\n" );
		const index = await listManifests( m_root, await readWorkspaceConfig( m_root ) );
		expect( [ ...index.manifests.keys() ].sort() ).toEqual( [
			"docs/auth/overview.md", "docs/auth/tokens.md", "plans/auth-v2.md"
		] );
		expect( index.manifests.get( "plans/auth-v2.md" )?.status ).toBe( "decided" );
		expect( index.problems ).toEqual( [] );
	} );

	it( "reports an invalid manifest against the doc its path mirrors", async () => {

		await write( ".docctx/docs/broken.md.yaml", "doc: docs/broken.md\ntype: nonsense\nstatus: draft\n" );
		const index = await listManifests( m_root, await readWorkspaceConfig( m_root ) );
		expect( index.manifests.has( "docs/broken.md" ) ).toBe( false );
		expect( index.problems ).toEqual( [ {
			"path": ".docctx/docs/broken.md.yaml",
			"doc": "docs/broken.md",
			"message": expect.stringContaining( "unknown type `nonsense`" ) as unknown
		} ] );
	} );

	it( "reports every manifest claiming the same doc, and indexes none of them", async () => {

		await write( ".docctx/docs/moved.md.yaml", "doc: docs/auth/tokens.md\ntype: guide\nstatus: draft\n" );
		const index = await listManifests( m_root, await readWorkspaceConfig( m_root ) );
		expect( index.manifests.has( "docs/auth/tokens.md" ) ).toBe( false );
		expect( index.problems.map( ( problem ) => [ problem.path, problem.doc ] ) ).toEqual( [
			[ ".docctx/docs/auth/tokens.md.yaml", "docs/auth/tokens.md" ],
			[ ".docctx/docs/moved.md.yaml", "docs/auth/tokens.md" ]
		] );
	} );
} );
