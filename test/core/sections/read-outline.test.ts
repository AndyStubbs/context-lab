import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { readDocManifest } from "../../../src/core/manifest/read-doc-manifest.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { buildOutline } from "../../../src/core/sections/build-outline.js";
import { findOrphanedSections } from "../../../src/core/sections/orphaned-sections.js";
import { readOutline } from "../../../src/core/sections/read-outline.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );

let m_root: WorkspaceRoot;

beforeEach( async () => {
	m_root = await WorkspaceRoot.open( FIXTURE_ROOT );
} );

describe( "readOutline", () => {

	it( "reads the fixture doc, including the §10 duplicate example", async () => {

		const result = await readOutline( m_root, "docs/auth/overview.md" );
		expect( result.doc ).toBe( "docs/auth/overview.md" );
		expect( result.sections.map( ( section ) => [ section.key, section.startLine, section.endLine ] ) ).toEqual( [
			[ "authentication-overview", 1, 27 ],
			[ "token-refresh", 5, 9 ],
			[ "error-codes", 10, 16 ],
			[ "setup", 17, 22 ],
			[ "setup/install", 19, 22 ],
			[ "upgrade", 23, 27 ],
			[ "upgrade/install", 25, 27 ]
		] );
		expect( result.warnings ).toEqual( [] );
	} );

	it( "rejects doc paths outside the workspace", async () => {
		await expect( readOutline( m_root, "../README.md" ) ).rejects.toBeInstanceOf( PathOutsideWorkspaceError );
	} );
} );

describe( "findOrphanedSections", () => {

	it( "finds no orphans when every manifest key matches a heading", async () => {

		const config = await readWorkspaceConfig( m_root );
		const loaded = await readDocManifest( m_root, config, "docs/auth/overview.md" );
		const result = await readOutline( m_root, "docs/auth/overview.md" );
		expect( loaded ).toBeDefined();
		if( loaded !== undefined ) {
			expect( findOrphanedSections( loaded.manifest, result ) ).toEqual( [] );
		}
	} );

	it( "reports keys that match no heading, in manifest order", async () => {

		const config = await readWorkspaceConfig( m_root );
		const loaded = await readDocManifest( m_root, config, "docs/auth/overview.md" );
		const renamed = buildOutline(
			"docs/auth/overview.md",
			"# Authentication overview\n## Refreshing tokens\n## Error codes\n## Install\n"
		);
		expect( loaded ).toBeDefined();
		if( loaded !== undefined ) {
			expect( findOrphanedSections( loaded.manifest, renamed ) ).toEqual( [ "token-refresh" ] );
			const sections = new Map( [ [ "setup/install", {} ], [ "error-codes", {} ] ] );
			const manifest = { ...loaded.manifest, "sections": sections };
			expect( findOrphanedSections( manifest, renamed ) ).toEqual( [ "setup/install" ] );
		}
	} );

	it( "reports every key of a single-unit doc", async () => {

		const config = await readWorkspaceConfig( m_root );
		const loaded = await readDocManifest( m_root, config, "docs/auth/overview.md" );
		const single = buildOutline( "api/openapi.yaml", "openapi: 3.1.0\n" );
		expect( loaded ).toBeDefined();
		if( loaded !== undefined ) {
			expect( findOrphanedSections( loaded.manifest, single ) ).toEqual( [ "token-refresh", "error-codes" ] );
		}
	} );
} );
