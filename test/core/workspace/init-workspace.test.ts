import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { initWorkspace, WORKSPACE_TEMPLATE } from "../../../src/core/workspace/init-workspace.js";
import {
	defaultWorkspaceConfig,
	parseWorkspaceConfig,
	readWorkspaceConfig
} from "../../../src/core/workspace/read-workspace-config.js";

let m_sandbox: string;
let m_root: WorkspaceRoot;

beforeEach( async () => {

	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-init-" ) ) );
	m_root = await WorkspaceRoot.open( m_sandbox );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

function read( relative: string ): Promise<string> {
	return readFile( path.join( m_sandbox, ...relative.split( "/" ) ), "utf8" );
}

describe( "initWorkspace", () => {

	it( "creates the workspace config, .gitignore and .gitattributes", async () => {

		expect( await initWorkspace( m_root ) ).toEqual( [
			{ "path": ".docctx/workspace.yaml", "change": "created" },
			{ "path": ".gitignore", "change": "created" },
			{ "path": ".gitattributes", "change": "created" }
		] );
		expect( await read( ".docctx/workspace.yaml" ) ).toBe( WORKSPACE_TEMPLATE );
		expect( await read( ".gitignore" ) ).toBe( ".docctx/cache.json\n.docctx/.history/\n" );
		expect( await read( ".gitattributes" ) ).toBe( ".docctx/**/*.lock linguist-generated\n" );
	} );

	it( "writes a config that means the same as no config", async () => {

		await initWorkspace( m_root );
		expect( await readWorkspaceConfig( m_root ) ).toEqual( defaultWorkspaceConfig() );
	} );

	it( "writes commented examples that are valid once uncommented", async () => {

		// Commented YAML starts with a key or indentation after `# `; prose starts with a capital
		const uncommented = WORKSPACE_TEMPLATE.replace( /^# (?=[a-z_]+:|\s)/gm, "" );
		expect( uncommented ).not.toBe( WORKSPACE_TEMPLATE );
		const config = await parseWorkspaceConfig( m_root, ".docctx/workspace.yaml", uncommented );
		expect( config.defaults.context ).toEqual( [ "docs/_style.md", "docs/_glossary.md" ] );
		expect( [ ...config.types.keys() ] ).toEqual( [ "reference", "guide", "plan" ] );
		expect( config.glossary?.banned_terms ).toEqual( [ { "term": "whitelist", "prefer": "allowlist" } ] );
		expect( config.settings.max_diff_bytes ).toBe( 20000 );
	} );

	it( "changes nothing when run again", async () => {

		await initWorkspace( m_root );
		const before = await Promise.all( [ ".docctx/workspace.yaml", ".gitignore", ".gitattributes" ].map( read ) );
		expect( ( await initWorkspace( m_root ) ).map( ( entry ) => entry.change ) ).toEqual( [
			"unchanged", "unchanged", "unchanged"
		] );
		const after = await Promise.all( [ ".docctx/workspace.yaml", ".gitignore", ".gitattributes" ].map( read ) );
		expect( after ).toEqual( before );
	} );

	it( "never overwrites an existing workspace config", async () => {

		await mkdir( path.join( m_sandbox, ".docctx" ) );
		await writeFile( path.join( m_sandbox, ".docctx", "workspace.yaml" ), "version: 1\n# mine\n" );
		const changes = await initWorkspace( m_root );
		expect( changes[ 0 ] ).toEqual( { "path": ".docctx/workspace.yaml", "change": "unchanged" } );
		expect( await read( ".docctx/workspace.yaml" ) ).toBe( "version: 1\n# mine\n" );
	} );

	it( "appends only missing lines, keeping the others", async () => {

		await writeFile( path.join( m_sandbox, ".gitignore" ), "node_modules/\n  .docctx/cache.json  \n" );
		await writeFile( path.join( m_sandbox, ".gitattributes" ), "* text=auto eol=lf" );
		const changes = await initWorkspace( m_root );
		expect( changes.slice( 1 ).map( ( entry ) => entry.change ) ).toEqual( [ "updated", "updated" ] );
		expect( await read( ".gitignore" ) ).toBe( "node_modules/\n  .docctx/cache.json  \n.docctx/.history/\n" );
		expect( await read( ".gitattributes" ) ).toBe( "* text=auto eol=lf\n.docctx/**/*.lock linguist-generated\n" );
	} );

	it( "keeps CRLF line endings", async () => {

		await writeFile( path.join( m_sandbox, ".gitignore" ), "dist/\r\n" );
		await initWorkspace( m_root );
		expect( await read( ".gitignore" ) ).toBe( "dist/\r\n.docctx/cache.json\r\n.docctx/.history/\r\n" );
	} );
} );
