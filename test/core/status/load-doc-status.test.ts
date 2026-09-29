import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReservedDocPathError } from "../../../src/core/manifest/reserved-doc-path-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { loadDocStatus } from "../../../src/core/status/load-doc-status.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import { ManifestError } from "../../../src/core/yaml/manifest-error.js";
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

describe( "loadDocStatus", () => {

	it( "returns a tracked doc's manifest and outline", async () => {

		const status = await loadDocStatus( m_root, await readWorkspaceConfig( m_root ), "docs/auth/overview.md" );
		expect( status.manifest?.type ).toBe( "reference" );
		expect( status.outline.sections.map( ( section ) => section.key ) ).toContain( "setup/install" );
		expect( status.orphanedSections ).toEqual( [] );
	} );

	it( "returns the outline of an untracked doc, so a scope can be proposed for it", async () => {

		const status = await loadDocStatus( m_root, await readWorkspaceConfig( m_root ), "docs/_style.md" );
		expect( status.manifest ).toBeUndefined();
		expect( status.outline.doc ).toBe( "docs/_style.md" );
	} );

	it( "reports manifest section keys that match no heading", async () => {

		await rm( path.join( m_scratch, "docs/auth/overview.md" ) );
		await writeFile( path.join( m_scratch, "docs/auth/overview.md" ), "# Overview\n\n## Token refresh\n" );
		const status = await loadDocStatus( m_root, await readWorkspaceConfig( m_root ), "docs/auth/overview.md" );
		expect( status.orphanedSections ).toEqual( [ "error-codes" ] );
	} );

	it( "rejects an invalid manifest and a path under .docctx/", async () => {

		const config = await readWorkspaceConfig( m_root );
		await writeFile( path.join( m_scratch, ".docctx/docs/auth/overview.md.yaml" ), "doc: docs/auth/overview.md\n" );
		await expect( loadDocStatus( m_root, config, "docs/auth/overview.md" ) )
			.rejects.toBeInstanceOf( ManifestError );
		await expect( loadDocStatus( m_root, config, ".docctx/workspace.yaml" ) )
			.rejects.toBeInstanceOf( ReservedDocPathError );
	} );
} );
