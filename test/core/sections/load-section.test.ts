import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { UnknownSectionError } from "../../../src/core/scope/unknown-section-error.js";
import { UntrackedDocError } from "../../../src/core/scope/untracked-doc-error.js";
import { loadSection } from "../../../src/core/sections/load-section.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";
import { fixturePath } from "../../helpers/scratch-fixture.js";

const BASIC = fixturePath( "basic" );
const SCOPE = fixturePath( "scope" );

let m_basic: WorkspaceRoot;
let m_basicConfig: WorkspaceConfig;

beforeEach( async () => {

	m_basic = await WorkspaceRoot.open( BASIC );
	m_basicConfig = await readWorkspaceConfig( m_basic );
} );

describe( "loadSection", () => {

	it( "returns a section from its heading to the line before the next heading at its level", async () => {

		const loaded = await loadSection( m_basic, m_basicConfig, "docs/auth/overview.md", "token-refresh" );
		expect( loaded.section ).toMatchObject( { "key": "token-refresh", "startLine": 5, "endLine": 9 } );
		expect( loaded.text ).toBe(
			"## Token refresh\n\n" +
			"Access tokens expire after 15 minutes. Call `POST /auth/refresh` with the refresh token to get\n" +
			"a new access token. Refresh tokens rotate on every use.\n\n"
		);
	} );

	it( "includes subsections", async () => {

		const loaded = await loadSection( m_basic, m_basicConfig, "docs/auth/overview.md", "setup" );
		expect( loaded.text ).toContain( "### Install" );
		expect( loaded.text ).not.toContain( "## Upgrade" );
	} );

	it( "returns the whole doc, as written, without a section", async () => {

		const root = await WorkspaceRoot.open( SCOPE );
		const loaded = await loadSection( root, await readWorkspaceConfig( root ), "api/openapi.yaml" );
		expect( loaded.section ).toBeUndefined();
		expect( loaded.outline.kind ).toBe( "single" );
		expect( loaded.text ).toBe( await readFile( path.join( SCOPE, "api/openapi.yaml" ), "utf8" ) );
	} );

	it( "rejects an untracked doc, a missing section, and a section of a single-unit doc", async () => {

		await expect( loadSection( m_basic, m_basicConfig, "docs/_style.md" ) )
			.rejects.toBeInstanceOf( UntrackedDocError );
		await expect( loadSection( m_basic, m_basicConfig, "docs/auth/overview.md", "install" ) )
			.rejects.toMatchObject( { "reason": "not-a-heading" } );

		const root = await WorkspaceRoot.open( SCOPE );
		const pending = loadSection( root, await readWorkspaceConfig( root ), "api/openapi.yaml", "info" );
		await expect( pending ).rejects.toBeInstanceOf( UnknownSectionError );
		await expect( pending ).rejects.toMatchObject( { "reason": "no-sections" } );
	} );
} );
