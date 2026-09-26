import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DocManifest } from "../../../src/core/manifest/doc-manifest.js";
import { parseDocManifest, readDocManifest } from "../../../src/core/manifest/read-doc-manifest.js";
import { ReservedDocPathError } from "../../../src/core/manifest/reserved-doc-path-error.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";
import { issuesOf } from "../../helpers/manifest-issues.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );
const FILE = ".docctx/docs/auth/overview.md.yaml";

let m_root: WorkspaceRoot;
let m_config: WorkspaceConfig;

beforeEach( async () => {

	m_root = await WorkspaceRoot.open( FIXTURE_ROOT );
	m_config = await readWorkspaceConfig( m_root );
} );

async function parse( ...lines: readonly string[] ): Promise<DocManifest> {

	const loaded = await parseDocManifest( m_root, m_config, FILE, `${lines.join( "\n" )}\n` );
	return loaded.manifest;
}

const HEADER = [ "doc: docs/auth/overview.md", "type: reference", "status: review" ];

describe( "readDocManifest", () => {

	it( "reads a manifest with doc scope and sections", async () => {

		const loaded = await readDocManifest( m_root, m_config, "docs/auth/overview.md" );
		expect( loaded?.file.file ).toBe( ".docctx/docs/auth/overview.md.yaml" );
		expect( loaded?.manifest ).toEqual( {
			"doc": "docs/auth/overview.md",
			"type": "reference",
			"status": "review",
			"audience": "integrators",
			"sources": [ "src/auth/**", "specs/auth-v2.md" ],
			"context": [ "docs/auth/tokens.md" ],
			"exclude": [ "plans/**" ],
			"sections": new Map( [
				[ "token-refresh", { "sources": [ "src/auth/refresh.ts" ] } ],
				[ "error-codes", {
					"sources": [ "src/auth/errors.ts" ],
					"context": [ "docs/_error-format.md" ]
				} ]
			] )
		} );
	} );

	it( "reads a manifest without sections", async () => {

		const loaded = await readDocManifest( m_root, m_config, "docs/auth/tokens.md" );
		expect( loaded?.manifest ).toEqual( {
			"doc": "docs/auth/tokens.md",
			"type": "reference",
			"status": "published",
			"audience": "integrators",
			"sources": [ "src/auth/refresh.ts", "specs/auth-v2.md" ],
			"sections": new Map()
		} );
	} );

	it( "reads a plan manifest", async () => {

		const loaded = await readDocManifest( m_root, m_config, "plans/auth-v2.md" );
		expect( loaded?.manifest ).toEqual( {
			"doc": "plans/auth-v2.md",
			"type": "plan",
			"status": "decided",
			"decided_on": "2026-09-01",
			"sources": [ "specs/auth-v2.md" ],
			"implements_into": [ "docs/auth/overview.md", "docs/auth/tokens.md" ],
			"sections": new Map()
		} );
	} );

	it( "normalizes the doc path it is given", async () => {

		const loaded = await readDocManifest( m_root, m_config, "./docs\\auth\\overview.md" );
		expect( loaded?.manifest.doc ).toBe( "docs/auth/overview.md" );
	} );

	it( "returns undefined for a doc without a manifest", async () => {
		expect( await readDocManifest( m_root, m_config, "docs/_style.md" ) ).toBeUndefined();
	} );

	it( "rejects doc paths outside the workspace", async () => {

		await expect( readDocManifest( m_root, m_config, "../README.md" ) )
			.rejects.toBeInstanceOf( PathOutsideWorkspaceError );
	} );

	it( "rejects reserved doc paths", async () => {

		await expect( readDocManifest( m_root, m_config, "workspace" ) )
			.rejects.toBeInstanceOf( ReservedDocPathError );
		await expect( readDocManifest( m_root, m_config, ".history/notes.md" ) )
			.rejects.toBeInstanceOf( ReservedDocPathError );
	} );
} );

describe( "parseDocManifest", () => {

	it( "reads verification records, replace context and every optional field", async () => {

		const manifest = await parse(
			...HEADER,
			"owner: platform team",
			"allow_terms: [whitelist]",
			"context: { replace: [docs/_style.md] }",
			"sections:",
			"  token-refresh:",
			"    context:",
			"      replace: []",
			"    verified:",
			"      at: 2026-09-25T14:02:00Z",
			"      by: human",
			"      via: elicitation",
			"      note: \"Confirmed after refresh interval change.\"",
			"  error-codes:",
			"    exclude: [src/auth/legacy/**]",
			"    verified: { at: 2026-09-25T14:02:00.123Z, by: ai }"
		);
		expect( manifest.owner ).toBe( "platform team" );
		expect( manifest.allow_terms ).toEqual( [ "whitelist" ] );
		expect( manifest.context ).toEqual( { "replace": [ "docs/_style.md" ] } );
		expect( manifest.sections.get( "token-refresh" ) ).toEqual( {
			"context": { "replace": [] },
			"verified": {
				"at": "2026-09-25T14:02:00Z",
				"by": "human",
				"via": "elicitation",
				"note": "Confirmed after refresh interval change."
			}
		} );
		expect( manifest.sections.get( "error-codes" ) ).toEqual( {
			"exclude": [ "src/auth/legacy/**" ],
			"verified": { "at": "2026-09-25T14:02:00.123Z", "by": "ai" }
		} );
	} );

	it( "accepts a top-level verification record on a doc without sections", async () => {

		const manifest = await parse( ...HEADER, "verified: { at: 2026-09-25T14:02:00Z, by: human, via: chat }" );
		expect( manifest.verified ).toEqual( { "at": "2026-09-25T14:02:00Z", "by": "human", "via": "chat" } );
	} );

	it( "keeps section order and slugs with slashes", async () => {

		const manifest = await parse( ...HEADER, "sections:", "  upgrade/install: {}", "  setup/install: {}" );
		expect( [ ...manifest.sections.keys() ] ).toEqual( [ "upgrade/install", "setup/install" ] );
	} );

	it( "reports missing required fields at the top of the manifest", async () => {

		expect( await issuesOf( parse( "# overview", "audience: integrators" ) ) ).toEqual( [
			{ "line": 2, "column": 1, "message": "missing required field `doc`" },
			{ "line": 2, "column": 1, "message": "missing required field `type`" },
			{ "line": 2, "column": 1, "message": "missing required field `status`" }
		] );
	} );

	it( "reports unknown fields at every level", async () => {

		const issues = await issuesOf( parse(
			...HEADER,
			"soruces: [src/**]",
			"context: { replace: [], extra: [] }",
			"sections:",
			"  token-refresh:",
			"    audience: admins",
			"    verified: { at: 2026-09-25T14:02:00Z, by: ai, reason: x }"
		) );
		expect( issues ).toEqual( [
			{ "line": 4, "column": 1, "message": "unknown field `soruces`" },
			{ "line": 5, "column": 25, "message": "unknown field `context.extra`" },
			{ "line": 8, "column": 5, "message": "unknown field `sections.token-refresh.audience`" },
			{ "line": 9, "column": 51, "message": "unknown field `sections.token-refresh.verified.reason`" }
		] );
	} );

	it( "reports an unknown type", async () => {

		expect( await issuesOf( parse( "doc: docs/a.md", "type: tutorial", "status: draft" ) ) ).toEqual( [ {
			"line": 2,
			"column": 7,
			"message": "unknown type `tutorial`; the workspace defines: reference, guide, plan"
		} ] );
	} );

	it( "reports a status that isn't one of the type's statuses", async () => {

		expect( await issuesOf( parse( "doc: docs/a.md", "type: reference", "status: decided" ) ) ).toEqual( [ {
			"line": 3,
			"column": 9,
			"message": "`decided` is not a status of type `reference`; " +
				"use one of: draft, review, published, deprecated"
		} ] );
	} );

	it( "reports non-string scalars", async () => {

		expect( await issuesOf( parse( "doc: docs/a.md", "type: reference", "status: 1", "owner: [a]" ) ) )
			.toEqual( [
				{ "line": 3, "column": 9, "message": "`status` must be a string" },
				{ "line": 4, "column": 8, "message": "`owner` must be a string" }
			] );
	} );

	it( "reports plan-only fields on other types", async () => {

		const issues = await issuesOf( parse(
			...HEADER,
			"supersedes: plans/auth-v1.md",
			"implements_into: [docs/auth/tokens.md]",
			"decided_on: 2026-09-01"
		) );
		expect( issues ).toEqual( [
			{ "line": 4, "column": 13, "message": "`supersedes` is only allowed on plans (type `plan`)" },
			{ "line": 5, "column": 18, "message": "`implements_into` is only allowed on plans (type `plan`)" },
			{ "line": 6, "column": 13, "message": "`decided_on` is only allowed on plans (type `plan`)" }
		] );
	} );

	it( "validates plan fields", async () => {

		const issues = await issuesOf( parse(
			"doc: plans/auth-v3.md",
			"type: plan",
			"status: draft",
			"supersedes: /plans/auth-v2.md",
			"implements_into: [docs/auth/overview.md, ../docs/other.md]",
			"decided_on: 2026-02-30"
		) );
		expect( issues ).toEqual( [
			{
				"line": 4,
				"column": 13,
				"message": "`supersedes` must be relative to the workspace root: \"/plans/auth-v2.md\""
			},
			{
				"line": 5,
				"column": 42,
				"message": "`implements_into[]` points outside the workspace: \"../docs/other.md\""
			},
			{ "line": 6, "column": 13, "message": "`decided_on` must be a date such as 2026-09-01" }
		] );
	} );

	it( "reports allow_terms entries that aren't strings", async () => {

		expect( await issuesOf( parse( ...HEADER, "allow_terms: [whitelist, 42, { term: x }]" ) ) ).toEqual( [
			{ "line": 4, "column": 26, "message": "`allow_terms[]` must be a string" },
			{ "line": 4, "column": 30, "message": "`allow_terms[]` must be a string" }
		] );
	} );

	it( "reports a malformed replace form", async () => {

		const issues = await issuesOf( parse(
			...HEADER,
			"context: { replace: docs/_style.md }",
			"sections:",
			"  a:",
			"    context: {}",
			"  b:",
			"    sources: { replace: [src/auth/refresh.ts] }"
		) );
		expect( issues ).toEqual( [
			{ "line": 4, "column": 21, "message": "`context.replace` must be a list" },
			{ "line": 7, "column": 14, "message": "missing required field `sections.a.context.replace`" },
			{
				"line": 9,
				"column": 14,
				"message": "`sections.b.sources` must be a list; only `context` accepts `{ replace: [...] }`"
			}
		] );
	} );

	it( "validates glob patterns in scope fields", async () => {

		const issues = await issuesOf( parse(
			...HEADER,
			"sources: [src/**, ../secrets/**]",
			"exclude: plans/**",
			"sections:",
			"  a:",
			"    context: [\"!docs/**\", C:/docs/**]"
		) );
		expect( issues ).toEqual( [
			{ "line": 4, "column": 19, "message": "`sources` points outside the workspace: \"../secrets/**\"" },
			{ "line": 5, "column": 10, "message": "`exclude` must be a list" },
			{
				"line": 8,
				"column": 15,
				"message": "`sections.a.context` can't use `!` patterns; list them under `exclude`: \"!docs/**\""
			},
			{
				"line": 8,
				"column": 27,
				"message": "`sections.a.context` must be relative to the workspace root: \"C:/docs/**\""
			}
		] );
	} );

	it( "validates verification records", async () => {

		const issues = await issuesOf( parse(
			...HEADER,
			"sections:",
			"  a:",
			"    verified: { at: 2026-09-25, by: human }",
			"  b:",
			"    verified: { at: 2026-09-25T25:00:00Z, by: ai, via: chat }",
			"  c:",
			"    verified: { by: robot, via: email }",
			"  d:",
			"    verified: { at: \"2026-09-25T14:02:00+02:00\", by: human, via: chat, note: 3 }"
		) );
		expect( issues ).toEqual( [
			{
				"line": 6,
				"column": 21,
				"message": "`sections.a.verified.at` must be a UTC timestamp such as 2026-09-25T14:02:00Z"
			},
			{
				"line": 6,
				"column": 15,
				"message": "missing `sections.a.verified.via`, which is required when `by` is `human`"
			},
			{
				"line": 8,
				"column": 21,
				"message": "`sections.b.verified.at` must be a UTC timestamp such as 2026-09-25T14:02:00Z"
			},
			{ "line": 8, "column": 56, "message": "`sections.b.verified.via` is only for human decisions" },
			{ "line": 10, "column": 15, "message": "missing required field `sections.c.verified.at`" },
			{ "line": 10, "column": 21, "message": "`sections.c.verified.by` must be one of: human, ai" },
			{ "line": 10, "column": 33, "message": "`sections.c.verified.via` must be one of: elicitation, chat" },
			{
				"line": 12,
				"column": 21,
				"message": "`sections.d.verified.at` must be a UTC timestamp such as 2026-09-25T14:02:00Z"
			},
			{ "line": 12, "column": 78, "message": "`sections.d.verified.note` must be a string" }
		].sort( ( a, b ) => a.line - b.line || a.column - b.column ) );
	} );

	it( "rejects a top-level verification record alongside sections", async () => {

		const issues = await issuesOf( parse(
			...HEADER,
			"verified: { at: 2026-09-25T14:02:00Z, by: ai }",
			"sections:",
			"  a: {}"
		) );
		expect( issues ).toEqual( [ {
			"line": 4,
			"column": 11,
			"message": "top-level `verified` is only for docs without sections; it belongs in a section entry"
		} ] );
	} );

	it( "reports section entries that aren't mappings", async () => {

		expect( await issuesOf( parse( ...HEADER, "sections:", "  a:", "  b: [src/**]" ) ) ).toEqual( [
			{ "line": 5, "column": 5, "message": "`sections.a` must be a mapping" },
			{ "line": 6, "column": 6, "message": "`sections.b` must be a mapping" }
		] );
	} );

	it( "rejects doc paths outside the workspace or reserved", async () => {

		const escape = await issuesOf( parse( "doc: ../README.md", "type: guide", "status: draft" ) );
		expect( escape ).toEqual( [
			{ "line": 1, "column": 6, "message": "`doc` points outside the workspace: \"../README.md\"" }
		] );
		const reserved = await issuesOf( parse( "doc: ./workspace", "type: guide", "status: draft" ) );
		expect( reserved ).toEqual( [
			{ "line": 1, "column": 6, "message": "`doc` is a reserved path and can't be tracked: \"workspace\"" }
		] );
		const history = await issuesOf( parse( "doc: .history/a.md", "type: guide", "status: draft" ) );
		expect( history.map( ( issue ) => issue.message ) ).toEqual( [
			"`doc` is a reserved path and can't be tracked: \".history/a.md\""
		] );
	} );

	it( "normalizes plain paths", async () => {

		const manifest = await parse(
			"doc: ./plans//auth-v3.md",
			"type: plan",
			"status: draft",
			"supersedes: plans\\auth-v2.md"
		);
		expect( manifest.doc ).toBe( "plans/auth-v3.md" );
		expect( manifest.supersedes ).toBe( "plans/auth-v2.md" );
	} );

	describe( "with symlinks", () => {

		let m_sandbox: string;

		beforeEach( async () => {

			m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-manifest-" ) ) );
			await mkdir( path.join( m_sandbox, "root", "docs" ), { "recursive": true } );
			await mkdir( path.join( m_sandbox, "outside" ) );
			await writeFile( path.join( m_sandbox, "outside", "doc.md" ), "# Outside\n" );
			await linkDirectory( path.join( m_sandbox, "outside" ), path.join( m_sandbox, "root", "docs", "linked" ) );
		} );

		afterEach( async () => {
			await rm( m_sandbox, { "recursive": true, "force": true } );
		} );

		it( "rejects plain paths that lead outside the workspace through a symlink", async () => {

			const root = await WorkspaceRoot.open( path.join( m_sandbox, "root" ) );
			const text = "doc: plans/p.md\ntype: plan\nstatus: draft\nimplements_into: [docs/linked/doc.md]\n";
			expect( await issuesOf( parseDocManifest( root, m_config, ".docctx/plans/p.md.yaml", text ) ) ).toEqual( [ {
				"line": 4,
				"column": 19,
				"message": "`implements_into[]` leads outside the workspace through a symlink: \"docs/linked/doc.md\""
			} ] );
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
