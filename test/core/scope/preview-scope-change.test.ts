import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestWriteError } from "../../../src/core/manifest/manifest-write-error.js";
import { TrackedFieldsError } from "../../../src/core/manifest/tracked-fields-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { previewScopeChange } from "../../../src/core/scope/preview-scope-change.js";
import { UnknownSectionError } from "../../../src/core/scope/unknown-section-error.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";
import { copyFixture, removeScratch } from "../../helpers/scratch-fixture.js";

const MANIFEST = ".docctx/docs/auth/overview.md.yaml";

let m_scratch: string;
let m_root: WorkspaceRoot;
let m_config: WorkspaceConfig;

beforeEach( async () => {

	m_scratch = await copyFixture( "basic" );
	m_root = await WorkspaceRoot.open( m_scratch );
	m_config = await readWorkspaceConfig( m_root );
} );

afterEach( async () => {
	await removeScratch( m_scratch );
} );

describe( "previewScopeChange", () => {

	it( "resolves the scope the change would produce, without writing", async () => {

		const before = await readFile( path.join( m_scratch, MANIFEST ), "utf8" );
		const preview = await previewScopeChange( m_root, m_config, "docs/auth/overview.md", {
			"section": "setup",
			"sources": [ "src/auth/errors.ts" ]
		} );
		expect( preview.update.changed ).toBe( true );
		expect( preview.previous?.sections.has( "setup" ) ).toBe( false );
		expect( preview.scope.section ).toBe( "setup" );
		expect( preview.scope.sources.map( ( entry ) => entry.path ) ).toEqual( [ "src/auth/errors.ts" ] );
		expect( await readFile( path.join( m_scratch, MANIFEST ), "utf8" ) ).toBe( before );
	} );

	it( "previews a new manifest for an untracked doc when given a type and status", async () => {

		const preview = await previewScopeChange(
			m_root,
			m_config,
			"docs/_style.md",
			{ "sources": [ "docs/_glossary.md" ] },
			{ "type": "reference", "status": "draft" }
		);
		expect( preview.previous ).toBeUndefined();
		expect( preview.update.path ).toBe( ".docctx/docs/_style.md.yaml" );
		expect( preview.update.previousText ).toBeUndefined();
		expect( preview.scope.sources.map( ( entry ) => entry.path ) ).toEqual( [ "docs/_glossary.md" ] );
	} );

	it( "rejects a section that isn't a heading, so it never creates an orphaned key", async () => {

		const pending = previewScopeChange( m_root, m_config, "docs/auth/overview.md", {
			"section": "install",
			"sources": [ "src/auth/errors.ts" ]
		} );
		await expect( pending ).rejects.toBeInstanceOf( UnknownSectionError );
		await expect( pending ).rejects.toMatchObject( { "reason": "not-a-heading" } );
	} );

	it( "rejects a type or status that differs from the tracked doc's", async () => {

		const pending = previewScopeChange(
			m_root,
			m_config,
			"docs/auth/overview.md",
			{ "sources": [ "src/**" ] },
			{ "type": "reference", "status": "draft" }
		);
		await expect( pending ).rejects.toBeInstanceOf( TrackedFieldsError );
		await expect( pending ).rejects.toThrow( "its status is review, not draft" );
	} );

	it( "accepts a type and status that match the tracked doc's", async () => {

		const preview = await previewScopeChange(
			m_root,
			m_config,
			"docs/auth/overview.md",
			{ "exclude": null },
			{ "type": "reference", "status": "review" }
		);
		expect( preview.update.changed ).toBe( true );
	} );

	it( "needs a type and status to track a doc, and a doc that exists", async () => {

		await expect( previewScopeChange( m_root, m_config, "docs/_style.md", { "sources": [ "src/**" ] } ) )
			.rejects.toBeInstanceOf( ManifestWriteError );
		const create = { "type": "guide", "status": "draft" };
		await expect( previewScopeChange( m_root, m_config, "docs/new.md", {}, create ) )
			.rejects.toMatchObject( { "code": "ENOENT" } );
	} );
} );
