import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { loadScope } from "../../../src/core/scope/load-scope.js";
import { UnknownSectionError } from "../../../src/core/scope/unknown-section-error.js";
import { UntrackedDocError } from "../../../src/core/scope/untracked-doc-error.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/scope", import.meta.url ) );

let m_root: WorkspaceRoot;
let m_config: WorkspaceConfig;

beforeEach( async () => {

	m_root = await WorkspaceRoot.open( FIXTURE_ROOT );
	m_config = await readWorkspaceConfig( m_root );
} );

describe( "loadScope", () => {

	it( "rejects a doc without a manifest", async () => {

		const pending = loadScope( m_root, m_config, "docs/_style.md" );
		await expect( pending ).rejects.toBeInstanceOf( UntrackedDocError );
		await expect( pending ).rejects.toMatchObject( { "doc": "docs/_style.md" } );
	} );

	it( "rejects a section that isn't a heading", async () => {

		const pending = loadScope( m_root, m_config, "docs/guide.md", "uninstall" );
		await expect( pending ).rejects.toBeInstanceOf( UnknownSectionError );
		await expect( pending ).rejects.toMatchObject( { "reason": "not-a-heading", "section": "uninstall" } );
	} );

	it( "rejects any section of a single-unit doc", async () => {

		await expect( loadScope( m_root, m_config, "api/openapi.yaml", "info" ) )
			.rejects.toMatchObject( { "reason": "no-sections" } );
	} );

	it( "resolves a heading without a manifest entry to the doc-level scope", async () => {

		const section = await loadScope( m_root, m_config, "docs/guide.md", "legacy" );
		const whole = await loadScope( m_root, m_config, "docs/guide.md" );
		expect( section.section ).toBe( "legacy" );
		expect( { ...section, "section": undefined } ).toEqual( { ...whole, "section": undefined } );
	} );

	it( "normalizes the doc path it is given", async () => {

		const scope = await loadScope( m_root, m_config, "./docs\\guide.md", "install" );
		expect( scope.doc ).toBe( "docs/guide.md" );
	} );
} );
