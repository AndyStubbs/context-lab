import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { DEFAULT_SETTINGS, DEFAULT_TYPES } from "../../../src/core/workspace/default-types.js";
import {
	parseWorkspaceConfig,
	readWorkspaceConfig
} from "../../../src/core/workspace/read-workspace-config.js";
import { issuesOf } from "../../helpers/manifest-issues.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );
const FILE = ".docctx/workspace.yaml";

let m_root: WorkspaceRoot;

beforeEach( async () => {
	m_root = await WorkspaceRoot.open( FIXTURE_ROOT );
} );

function parse( text: string ): ReturnType<typeof parseWorkspaceConfig> {
	return parseWorkspaceConfig( m_root, FILE, text );
}

describe( "readWorkspaceConfig", () => {

	it( "reads the fixture workspace", async () => {

		const config = await readWorkspaceConfig( m_root );
		expect( config.version ).toBe( 1 );
		expect( config.defaults ).toEqual( {
			"context": [ "docs/_style.md", "docs/_glossary.md" ],
			"exclude": [ "**/drafts/archive/**", "**/node_modules/**" ]
		} );
		expect( [ ...config.types.keys() ] ).toEqual( [ "reference", "guide", "plan" ] );
		expect( config.types.get( "plan" ) ).toEqual( {
			"statuses": [ "draft", "proposed", "decided", "superseded" ],
			"exclude_from_context_when": [ "superseded" ]
		} );
		expect( config.types.get( "guide" )?.exclude_from_context_when ).toEqual( [] );
		expect( config.glossary ).toEqual( {
			"file": "docs/_glossary.md",
			"banned_terms": [
				{ "term": "whitelist", "prefer": "allowlist" },
				{ "term": "e-mail", "prefer": "email" }
			]
		} );
		expect( config.settings ).toEqual( {
			"hash_algorithm": "sha256",
			"max_context_bytes": 200000,
			"max_diff_bytes": 20000
		} );
	} );

	describe( "without workspace.yaml", () => {

		let m_sandbox: string;

		beforeEach( async () => {

			m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-config-" ) ) );
			await mkdir( path.join( m_sandbox, ".docctx" ) );
		} );

		afterEach( async () => {
			await rm( m_sandbox, { "recursive": true, "force": true } );
		} );

		it( "uses the defaults", async () => {

			const config = await readWorkspaceConfig( await WorkspaceRoot.open( m_sandbox ) );
			expect( config ).toEqual( {
				"version": 1,
				"defaults": { "context": [], "exclude": [] },
				"types": DEFAULT_TYPES,
				"settings": DEFAULT_SETTINGS
			} );
		} );
	} );
} );

describe( "parseWorkspaceConfig", () => {

	it( "fills in defaults for a minimal file", async () => {

		const config = await parse( "version: 1\n" );
		expect( config.types ).toBe( DEFAULT_TYPES );
		expect( config.settings ).toEqual( DEFAULT_SETTINGS );
		expect( config.defaults ).toEqual( { "context": [], "exclude": [] } );
		expect( config.glossary ).toBeUndefined();
	} );

	it( "replaces the default types when any type is defined", async () => {

		const config = await parse( "version: 1\ntypes:\n  spec:\n    statuses: [draft, final]\n" );
		expect( [ ...config.types.keys() ] ).toEqual( [ "spec" ] );
	} );

	it( "fills in settings that are left out", async () => {

		const config = await parse( "version: 1\nsettings:\n  max_context_bytes: 1000\n" );
		expect( config.settings ).toEqual( { ...DEFAULT_SETTINGS, "max_context_bytes": 1000 } );
	} );

	it( "requires version 1", async () => {

		expect( await issuesOf( parse( "defaults: {}\n" ) ) ).toEqual( [
			{ "line": 1, "column": 1, "message": "missing required field `version`" }
		] );
		expect( await issuesOf( parse( "version: 2\n" ) ) ).toEqual( [ {
			"line": 1,
			"column": 10,
			"message": "unsupported `version`; this version of ContextLabs reads version 1"
		} ] );
	} );

	it( "rejects an empty file and a top level that isn't a mapping", async () => {

		expect( await issuesOf( parse( "" ) ) ).toEqual( [
			{ "line": 1, "column": 1, "message": "file is empty" }
		] );
		expect( await issuesOf( parse( "- version\n" ) ) ).toEqual( [
			{ "line": 1, "column": 1, "message": "top level must be a mapping" }
		] );
	} );

	it( "rejects unknown fields at every level", async () => {

		const text = [
			"version: 1",
			"defualts: {}",
			"defaults:",
			"  sources: [src/**]",
			"types:",
			"  plan:",
			"    statuses: [draft]",
			"    color: red",
			"settings:",
			"  max_bytes: 1",
			""
		].join( "\n" );
		expect( await issuesOf( parse( text ) ) ).toEqual( [
			{ "line": 2, "column": 1, "message": "unknown field `defualts`" },
			{ "line": 4, "column": 3, "message": "unknown field `defaults.sources`" },
			{ "line": 8, "column": 5, "message": "unknown field `types.plan.color`" },
			{ "line": 10, "column": 3, "message": "unknown field `settings.max_bytes`" }
		] );
	} );

	it( "validates types and their statuses", async () => {

		const text = [
			"version: 1",
			"types:",
			"  reference:",
			"    statuses: []",
			"  guide:",
			"    exclude_from_context_when: [draft]",
			"  plan:",
			"    statuses: [draft, decided, draft]",
			"    exclude_from_context_when: [superseded]",
			"  note: draft",
			""
		].join( "\n" );
		expect( await issuesOf( parse( text ) ) ).toEqual( [
			{ "line": 4, "column": 15, "message": "`types.reference.statuses` must list at least one status" },
			{ "line": 6, "column": 5, "message": "missing required field `types.guide.statuses`" },
			{ "line": 8, "column": 32, "message": "`types.plan.statuses` lists `draft` twice" },
			{
				"line": 9,
				"column": 33,
				"message": "`types.plan.exclude_from_context_when` has `superseded`, " +
					"which is not one of the type's statuses"
			},
			{ "line": 10, "column": 9, "message": "`types.note` must be a mapping" }
		] );
	} );

	it( "rejects an empty types map", async () => {

		expect( await issuesOf( parse( "version: 1\ntypes: {}\n" ) ) ).toEqual( [
			{ "line": 2, "column": 8, "message": "`types` must define at least one type" }
		] );
	} );

	it( "validates defaults as lists of confined globs", async () => {

		const text = [
			"version: 1",
			"defaults:",
			"  context: docs/_style.md",
			"  exclude:",
			"    - ../outside/**",
			"    - /etc/**",
			"    - 42",
			"    - \"!keep/**\"",
			""
		].join( "\n" );
		expect( await issuesOf( parse( text ) ) ).toEqual( [
			{ "line": 3, "column": 12, "message": "`defaults.context` must be a list" },
			{ "line": 5, "column": 7, "message": "`defaults.exclude` points outside the workspace: \"../outside/**\"" },
			{
				"line": 6,
				"column": 7,
				"message": "`defaults.exclude` must be relative to the workspace root: \"/etc/**\""
			},
			{ "line": 7, "column": 7, "message": "`defaults.exclude[]` must be a string" },
			{
				"line": 8,
				"column": 7,
				"message": "`defaults.exclude` can't use `!` patterns; list them under `exclude`: \"!keep/**\""
			}
		] );
	} );

	it( "validates the glossary", async () => {

		const text = [
			"version: 1",
			"glossary:",
			"  file: ../glossary.md",
			"  banned_terms:",
			"    - term: whitelist",
			"    - term: \"\"",
			"      prefer: x",
			"    - blacklist",
			"    - term: e-mail",
			"      prefer: email",
			"      note: x",
			""
		].join( "\n" );
		expect( await issuesOf( parse( text ) ) ).toEqual( [
			{ "line": 3, "column": 9, "message": "`glossary.file` points outside the workspace: \"../glossary.md\"" },
			{ "line": 5, "column": 7, "message": "missing required field `glossary.banned_terms[].prefer`" },
			{ "line": 6, "column": 13, "message": "`glossary.banned_terms[].term` must not be empty" },
			{ "line": 8, "column": 7, "message": "`glossary.banned_terms[]` must be a mapping" },
			{ "line": 11, "column": 7, "message": "unknown field `glossary.banned_terms[].note`" }
		] );
	} );

	it( "validates settings", async () => {

		const text = [
			"version: 1",
			"settings:",
			"  hash_algorithm: sha-9000",
			"  max_context_bytes: 0",
			"  max_diff_bytes: \"20000\"",
			""
		].join( "\n" );
		expect( await issuesOf( parse( text ) ) ).toEqual( [
			{
				"line": 3,
				"column": 19,
				"message": "`settings.hash_algorithm` is not a hash algorithm Node.js supports: \"sha-9000\""
			},
			{ "line": 4, "column": 22, "message": "`settings.max_context_bytes` must be a positive integer" },
			{ "line": 5, "column": 19, "message": "`settings.max_diff_bytes` must be a positive integer" }
		] );
	} );

	it( "formats every issue as file:line:column", async () => {

		await expect( parse( "version: 1\nsettings:\n  max_diff_bytes: -1\n  extra: 1\n" ) ).rejects.toThrow(
			".docctx/workspace.yaml:3:19: `settings.max_diff_bytes` must be a positive integer\n" +
			".docctx/workspace.yaml:4:3: unknown field `settings.extra`"
		);
	} );
} );
