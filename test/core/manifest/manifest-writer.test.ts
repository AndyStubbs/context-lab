import { cp, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestWriteError } from "../../../src/core/manifest/manifest-write-error.js";
import { prepareScopeChange, writeManifestUpdate } from "../../../src/core/manifest/manifest-writer.js";
import { readDocManifest } from "../../../src/core/manifest/read-doc-manifest.js";
import { ReservedDocPathError } from "../../../src/core/manifest/reserved-doc-path-error.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";
import { ManifestError } from "../../../src/core/yaml/manifest-error.js";
import { diffLines } from "../../helpers/line-diff.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );

let m_sandbox: string;
let m_root: WorkspaceRoot;
let m_config: WorkspaceConfig;

beforeEach( async () => {

	// Work on a copy, since these tests write manifests
	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-writer-" ) ) );
	await cp( FIXTURE_ROOT, m_sandbox, { "recursive": true } );
	m_root = await WorkspaceRoot.open( m_sandbox );
	m_config = await readWorkspaceConfig( m_root );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

function manifestFile( relative: string ): string {
	return path.join( m_sandbox, ".docctx", ...relative.split( "/" ) );
}

describe( "prepareScopeChange and writeManifestUpdate", () => {

	it( "prepares without writing, then writes the validated result", async () => {

		const before = await readFile( manifestFile( "docs/auth/tokens.md.yaml" ), "utf8" );
		const update = await prepareScopeChange( m_root, m_config, "docs/auth/tokens.md", {
			"exclude": [ "src/auth/legacy/**" ]
		} );
		expect( update.path ).toBe( ".docctx/docs/auth/tokens.md.yaml" );
		expect( update.changed ).toBe( true );
		expect( update.manifest.exclude ).toEqual( [ "src/auth/legacy/**" ] );
		expect( await readFile( manifestFile( "docs/auth/tokens.md.yaml" ), "utf8" ) ).toBe( before );

		await writeManifestUpdate( m_root, update );
		const after = await readFile( manifestFile( "docs/auth/tokens.md.yaml" ), "utf8" );
		expect( after ).toBe( update.text );
		expect( diffLines( before, after ) ).toEqual( {
			"removed": [],
			"added": [ "exclude:", "  - src/auth/legacy/**" ]
		} );
		const reread = await readDocManifest( m_root, m_config, "docs/auth/tokens.md" );
		expect( reread?.manifest ).toEqual( update.manifest );
	} );

	it( "keeps the fixture's comments, normalizing only their alignment", async () => {

		const before = await readFile( manifestFile( "docs/auth/overview.md.yaml" ), "utf8" );
		const update = await prepareScopeChange( m_root, m_config, "docs/auth/overview.md", {
			"section": "token-refresh",
			"sources": [ "src/auth/refresh.ts", "src/auth/clock.ts" ]
		} );
		await writeManifestUpdate( m_root, update );
		const after = await readFile( manifestFile( "docs/auth/overview.md.yaml" ), "utf8" );
		expect( diffLines( before, after ) ).toEqual( {
			"removed": [
				"sources:            # authoritative facts; the doc may only claim what these support",
				"context:            # style, framing, related docs",
				"    sources: [src/auth/refresh.ts]"
			],
			"added": [
				"sources: # authoritative facts; the doc may only claim what these support",
				"context: # style, framing, related docs",
				"    sources: [src/auth/refresh.ts, src/auth/clock.ts]"
			]
		} );
	} );

	it( "creates a manifest, and its folders, for an untracked doc", async () => {

		const update = await prepareScopeChange(
			m_root,
			m_config,
			"docs/_error-format.md",
			{ "sources": [ "src/auth/errors.ts" ] },
			{ "type": "reference", "status": "draft" }
		);
		expect( update.previousText ).toBeUndefined();
		await writeManifestUpdate( m_root, update );
		expect( await readFile( manifestFile( "docs/_error-format.md.yaml" ), "utf8" ) ).toBe(
			"doc: docs/_error-format.md\ntype: reference\nstatus: draft\n\nsources:\n  - src/auth/errors.ts\n"
		);

		const nested = await prepareScopeChange(
			m_root,
			m_config,
			"guides/setup/install.md",
			{},
			{ "type": "guide", "status": "draft" }
		);
		expect( nested.changed ).toBe( true );
		await writeManifestUpdate( m_root, nested );
		expect( ( await stat( manifestFile( "guides/setup/install.md.yaml" ) ) ).isFile() ).toBe( true );
	} );

	it( "ignores the create fields when the doc already has a manifest", async () => {

		const update = await prepareScopeChange(
			m_root,
			m_config,
			"docs/auth/tokens.md",
			{ "exclude": [ "plans/**" ] },
			{ "type": "guide", "status": "draft" }
		);
		expect( update.manifest.type ).toBe( "reference" );
	} );

	it( "requires create fields for an untracked doc", async () => {

		const pending = prepareScopeChange( m_root, m_config, "docs/_style.md", { "sources": [ "src/**" ] } );
		await expect( pending ).rejects.toBeInstanceOf( ManifestWriteError );
		await expect( pending ).rejects.toMatchObject( { "reason": "untracked" } );
	} );

	it( "returns the file untouched when nothing changes, and writing it is a no-op", async () => {

		const before = await readFile( manifestFile( "docs/auth/overview.md.yaml" ), "utf8" );
		const update = await prepareScopeChange( m_root, m_config, "docs/auth/overview.md", {
			"exclude": [ "plans/**" ]
		} );
		expect( update.changed ).toBe( false );
		expect( update.text ).toBe( before );

		// Even if the file changes meanwhile, an unchanged update writes nothing
		await writeFile( manifestFile( "docs/auth/overview.md.yaml" ), `${before}# edited\n` );
		await writeManifestUpdate( m_root, update );
		expect( await readFile( manifestFile( "docs/auth/overview.md.yaml" ), "utf8" ) ).toBe( `${before}# edited\n` );
	} );

	it( "refuses to write over a manifest that changed after the update was prepared", async () => {

		const update = await prepareScopeChange( m_root, m_config, "docs/auth/tokens.md", {
			"exclude": [ "plans/**" ]
		} );
		const edited = "doc: docs/auth/tokens.md\ntype: guide\nstatus: draft\n";
		await writeFile( manifestFile( "docs/auth/tokens.md.yaml" ), edited );
		await expect( writeManifestUpdate( m_root, update ) ).rejects.toMatchObject( { "reason": "changed-on-disk" } );
	} );

	it( "refuses to create a manifest that appeared after the update was prepared", async () => {

		const update = await prepareScopeChange(
			m_root,
			m_config,
			"docs/_style.md",
			{},
			{ "type": "guide", "status": "draft" }
		);
		await writeFile( manifestFile( "docs/_style.md.yaml" ), "doc: docs/_style.md\ntype: guide\nstatus: review\n" );
		await expect( writeManifestUpdate( m_root, update ) ).rejects.toMatchObject( { "reason": "changed-on-disk" } );
	} );

	it( "rejects glob patterns outside the workspace before editing", async () => {

		await expect(
			prepareScopeChange( m_root, m_config, "docs/auth/tokens.md", { "sources": [ "../secrets/**" ] } )
		).rejects.toBeInstanceOf( PathOutsideWorkspaceError );
		await expect(
			prepareScopeChange( m_root, m_config, "docs/auth/tokens.md", { "context": { "replace": [ "/etc/**" ] } } )
		).rejects.toBeInstanceOf( PathOutsideWorkspaceError );
	} );

	it( "rejects reserved doc paths", async () => {

		await expect(
			prepareScopeChange( m_root, m_config, "workspace", {}, { "type": "guide", "status": "draft" } )
		).rejects.toBeInstanceOf( ReservedDocPathError );
	} );

	it( "validates the result, so an unknown type never reaches disk", async () => {

		const pending = prepareScopeChange(
			m_root,
			m_config,
			"docs/_style.md",
			{},
			{ "type": "tutorial", "status": "draft" }
		);
		await expect( pending ).rejects.toBeInstanceOf( ManifestError );
		await expect( pending ).rejects.toThrow( "unknown type `tutorial`" );
	} );

	it( "keeps CRLF line endings in a manifest that uses them", async () => {

		const crlf = "doc: docs/auth/tokens.md\r\ntype: reference\r\nstatus: published\r\n";
		await writeFile( manifestFile( "docs/auth/tokens.md.yaml" ), crlf );
		const update = await prepareScopeChange( m_root, m_config, "docs/auth/tokens.md", {
			"sources": [ "src/auth/refresh.ts" ]
		} );
		expect( update.text ).toBe( `${crlf}\r\nsources:\r\n  - src/auth/refresh.ts\r\n` );
	} );
} );
