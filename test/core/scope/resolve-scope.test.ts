import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DocManifest } from "../../../src/core/manifest/doc-manifest.js";
import { listManifests } from "../../../src/core/manifest/list-manifests.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import type { ResolvedScope } from "../../../src/core/scope/resolved-scope.js";
import { resolveScope } from "../../../src/core/scope/resolve-scope.js";
import { defaultWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";

let m_sandbox: string;
let m_rootDir: string;
let m_root: WorkspaceRoot;

beforeEach( async () => {

	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-scope-" ) ) );
	m_rootDir = path.join( m_sandbox, "root" );
	await mkdir( path.join( m_rootDir, ".docctx" ), { "recursive": true } );
	await mkdir( path.join( m_sandbox, "outside" ) );
	await writeFile( path.join( m_sandbox, "outside", "secret.ts" ), "secret\n" );
	m_root = await WorkspaceRoot.open( m_rootDir );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

async function write( relative: string, text: string ): Promise<void> {

	const target = path.join( m_rootDir, ...relative.split( "/" ) );
	await mkdir( path.dirname( target ), { "recursive": true } );
	await writeFile( target, text );
}

function doc( fields: Partial<DocManifest> ): DocManifest {
	return { "doc": "docs/a.md", "type": "guide", "status": "draft", "sections": new Map(), ...fields };
}

async function resolve(
	manifest: DocManifest,
	config: WorkspaceConfig = defaultWorkspaceConfig()
): Promise<ResolvedScope> {
	return resolveScope( m_root, config, manifest, await listManifests( m_root, config ), undefined );
}

function paths( entries: readonly { readonly path: string }[] ): readonly string[] {
	return entries.map( ( entry ) => entry.path );
}

describe( "resolveScope", () => {

	it( "sorts by code unit, not locale", async () => {

		// Names differ by more than case, so this also works on case-insensitive filesystems
		await write( "src/d.ts", "d" );
		await write( "src/B.ts", "B" );
		await write( "src/a.ts", "a" );
		await write( "src/_c.ts", "c" );
		const scope = await resolve( doc( { "sources": [ "src/**" ] } ) );
		expect( paths( scope.sources ) ).toEqual( [ "src/B.ts", "src/_c.ts", "src/a.ts", "src/d.ts" ] );
	} );

	it( "never includes .git/ or .docctx/, and skips dotfiles unless named", async () => {

		await write( ".git/config", "x" );
		await write( ".docctx/docs/a.md.yaml", "doc: docs/a.md\ntype: guide\nstatus: draft\n" );
		await write( "src/.env", "x" );
		await write( "src/a.ts", "a" );
		await write( ".github/ci.yml", "x" );
		const scope = await resolve( doc( { "sources": [ "**", ".github/**", ".git/config" ] } ) );
		expect( paths( scope.sources ) ).toEqual( [ ".github/ci.yml", "src/a.ts" ] );
		expect( scope.warnings ).toEqual( [ { "kind": "no-match", "rule": "sources", "pattern": ".git/config" } ] );
	} );

	it( "matches excludes against dotfiles", async () => {

		await write( ".github/ci.yml", "x" );
		const scope = await resolve( doc( { "sources": [ ".github/**" ], "exclude": [ "**/*.yml" ] } ) );
		expect( paths( scope.sources ) ).toEqual( [] );
		expect( paths( scope.excluded ) ).toEqual( [ ".github/ci.yml" ] );
	} );

	it( "keeps exclude winning over an exact source path", async () => {

		await write( "src/a.ts", "a" );
		const scope = await resolve( doc( { "sources": [ "src/a.ts" ], "exclude": [ "src/**" ] } ) );
		expect( scope.sources ).toEqual( [] );
		expect( scope.excluded ).toEqual( [ {
			"path": "src/a.ts",
			"role": "source",
			"reasons": [ { "rule": "sources", "pattern": "src/a.ts" } ],
			"excludedBy": { "kind": "pattern", "rule": "exclude", "pattern": "src/**" }
		} ] );
	} );

	it( "applies type rules to sources too", async () => {

		await write( "plans/old.md", "# Old\n" );
		await write( ".docctx/plans/old.md.yaml", "doc: plans/old.md\ntype: plan\nstatus: superseded\n" );
		const scope = await resolve( doc( { "sources": [ "plans/old.md" ] } ) );
		expect( scope.sources ).toEqual( [] );
		expect( scope.excluded[ 0 ]?.excludedBy ).toEqual( {
			"kind": "type-rule",
			"rule": "types.plan.exclude_from_context_when",
			"type": "plan",
			"status": "superseded"
		} );
	} );

	it( "drops a doc whose manifest is broken, with a warning", async () => {

		await write( "plans/maybe.md", "# Maybe\n" );
		await write( ".docctx/plans/maybe.md.yaml", "doc: plans/maybe.md\ntype: plan\n" );
		const scope = await resolve( doc( { "context": [ "plans/**" ] } ) );
		expect( scope.context ).toEqual( [] );
		expect( scope.excluded[ 0 ]?.excludedBy ).toEqual( {
			"kind": "untracked-status",
			"manifest": ".docctx/plans/maybe.md.yaml"
		} );
		expect( scope.warnings ).toEqual( [ {
			"kind": "unreadable-manifest",
			"manifest": ".docctx/plans/maybe.md.yaml",
			"message": ".docctx/plans/maybe.md.yaml:1:1: missing required field `status`"
		} ] );
	} );

	it( "ignores broken manifests of docs that aren't in scope", async () => {

		await write( "src/a.ts", "a" );
		await write( ".docctx/plans/maybe.md.yaml", "not: valid\n" );
		const scope = await resolve( doc( { "sources": [ "src/**" ] } ) );
		expect( scope.warnings ).toEqual( [] );
	} );

	it( "totals sizes and warns above max_context_bytes without truncating", async () => {

		await write( "src/a.ts", "12345" );
		await write( "docs/b.md", "1234567" );
		const config = defaultWorkspaceConfig();
		const tight = { ...config, "settings": { ...config.settings, "max_context_bytes": 10 } };
		const scope = await resolve( doc( { "sources": [ "src/a.ts" ], "context": [ "docs/b.md" ] } ), tight );
		expect( scope.totalBytes ).toBe( 12 );
		expect( scope.sources[ 0 ]?.sizeBytes ).toBe( 5 );
		expect( paths( scope.context ) ).toEqual( [ "docs/b.md" ] );
		expect( scope.warnings ).toEqual( [ { "kind": "over-budget", "totalBytes": 12, "maxBytes": 10 } ] );
	} );

	it( "warns about patterns that match only directories", async () => {

		await write( "src/a.ts", "a" );
		const scope = await resolve( doc( { "sources": [ "src" ] } ) );
		expect( scope.warnings ).toEqual( [ { "kind": "no-match", "rule": "sources", "pattern": "src" } ] );
	} );

	it( "resolves a manifest that hasn't been written, as set_scope does", async () => {

		await write( "src/a.ts", "a" );
		const scope = await resolve( doc( { "doc": "docs/new.md", "sources": [ "src/a.ts" ] } ) );
		expect( scope.doc ).toBe( "docs/new.md" );
		expect( paths( scope.sources ) ).toEqual( [ "src/a.ts" ] );
	} );

	describe( "symlinks", () => {

		it( "reports a symlinked directory that leads outside instead of walking into it", async () => {

			await write( "src/a.ts", "a" );
			await linkDirectory( path.join( m_sandbox, "outside" ), path.join( m_rootDir, "src", "linked" ) );
			const walked = await resolve( doc( { "sources": [ "src/**" ] } ) );
			expect( paths( walked.sources ) ).toEqual( [ "src/a.ts" ] );
			expect( walked.excluded.map( ( entry ) => [ entry.path, entry.excludedBy.kind ] ) ).toEqual( [
				[ "src/linked", "outside-workspace" ]
			] );

			const named = await resolve( doc( { "sources": [ "src/linked/secret.ts" ] } ) );
			expect( named.sources ).toEqual( [] );
			expect( named.excluded ).toEqual( [ {
				"path": "src/linked/secret.ts",
				"role": "source",
				"reasons": [ { "rule": "sources", "pattern": "src/linked/secret.ts" } ],
				"excludedBy": { "kind": "outside-workspace" }
			} ] );
			expect( named.warnings ).toEqual( [] );
		} );

		it( "keeps a symlinked file inside the workspace and reports one leading outside", async ( context ) => {

			await write( "src/a.ts", "a" );
			const src = path.join( m_rootDir, "src" );
			const linkedIn = await tryLinkFile( path.join( src, "a.ts" ), path.join( src, "in.ts" ) );
			if( !linkedIn ) {
				context.skip( "file symlinks need extra privileges on this system" );
			}
			await tryLinkFile( path.join( m_sandbox, "outside", "secret.ts" ), path.join( src, "out.ts" ) );
			const scope = await resolve( doc( { "sources": [ "src/**" ] } ) );
			expect( paths( scope.sources ) ).toEqual( [ "src/a.ts", "src/in.ts" ] );
			expect( scope.excluded.map( ( entry ) => [ entry.path, entry.excludedBy.kind ] ) ).toEqual( [
				[ "src/out.ts", "outside-workspace" ]
			] );
		} );
	} );
} );

/** Directory links use junctions on Windows, which need no extra privileges. */
async function linkDirectory( target: string, linkPath: string ): Promise<void> {

	if( process.platform === "win32" ) {
		await symlink( target, linkPath, "junction" );
	} else {
		await symlink( target, linkPath, "dir" );
	}
}

/** Returns false when the OS refuses to create file symlinks (Windows without privileges). */
async function tryLinkFile( target: string, linkPath: string ): Promise<boolean> {

	try {
		await symlink( target, linkPath, "file" );
		return true;
	} catch( error ) {
		if( error instanceof Error && "code" in error && error.code === "EPERM" ) {
			return false;
		}
		throw error;
	}
}
