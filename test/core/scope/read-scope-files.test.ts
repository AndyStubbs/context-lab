import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { loadScope } from "../../../src/core/scope/load-scope.js";
import { readScopeFiles } from "../../../src/core/scope/read-scope-files.js";
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

describe( "readScopeFiles", () => {

	it( "reads every file in full, sources first", async () => {

		const config = await readWorkspaceConfig( m_root );
		const scope = await loadScope( m_root, config, "docs/auth/overview.md", "token-refresh" );
		const files = await readScopeFiles( m_root, scope );
		expect( files.map( ( file ) => [ file.path, file.role ] ) ).toEqual( [
			[ "src/auth/refresh.ts", "source" ],
			[ "docs/_glossary.md", "context" ],
			[ "docs/_style.md", "context" ],
			[ "docs/auth/tokens.md", "context" ]
		] );
		expect( files[ 0 ]?.text ).toBe( await readFile( path.join( m_scratch, "src/auth/refresh.ts" ), "utf8" ) );
	} );

	it( "leaves out the text of a binary file but keeps its size", async () => {

		await writeFile( path.join( m_scratch, "src/auth/refresh.ts" ), Buffer.from( [ 0x89, 0x50, 0x00, 0x01 ] ) );
		const config = await readWorkspaceConfig( m_root );
		const scope = await loadScope( m_root, config, "docs/auth/overview.md", "token-refresh" );
		const [ binary ] = await readScopeFiles( m_root, scope );
		expect( binary ).toEqual( { "path": "src/auth/refresh.ts", "role": "source", "sizeBytes": 4 } );
	} );
} );
