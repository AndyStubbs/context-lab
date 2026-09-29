import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ElicitRequest, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolOutput } from "../../helpers/mcp-client.js";
import { callTool, callToolJson, connectClient } from "../../helpers/mcp-client.js";
import { diffLines } from "../../helpers/line-diff.js";
import { copyFixture, removeScratch } from "../../helpers/scratch-fixture.js";

const MANIFEST = ".docctx/docs/auth/overview.md.yaml";
const SETUP_SOURCES = { "doc": "docs/auth/overview.md", "section": "setup", "sources": [ "src/auth/errors.ts" ] };

let m_scratch: string;
let m_client: Client | undefined;
let m_asked: ElicitRequest[ "params" ][];

beforeEach( async () => {

	m_scratch = await copyFixture( "basic" );
	m_asked = [];
} );

afterEach( async () => {

	await m_client?.close();
	m_client = undefined;
	await removeScratch( m_scratch );
} );

/** A client whose user always answers `action`, recording what they were asked. */
async function connectAnswering( action: ElicitResult[ "action" ] ): Promise<Client> {

	m_client = await connectClient( m_scratch, ( params ) => {
		m_asked.push( params );
		return { "action": action };
	} );
	return m_client;
}

async function connectWithoutElicitation(): Promise<Client> {

	m_client = await connectClient( m_scratch );
	return m_client;
}

async function readManifest(): Promise<string> {
	return readFile( path.join( m_scratch, MANIFEST ), "utf8" );
}

function json( output: ToolOutput ): unknown {

	expect( output.isError, output.texts.join( "\n" ) ).toBe( false );
	return JSON.parse( output.texts[ 0 ] ?? "" );
}

describe( "set_scope with elicitation", () => {

	it( "asks the user in three lines and writes the manifest, comments intact, on accept", async () => {

		const client = await connectAnswering( "accept" );
		const before = await readManifest();
		expect( await callToolJson( client, "set_scope", SETUP_SOURCES ) ).toEqual( {
			"result": "written",
			"manifest": MANIFEST,
			"created": false
		} );

		expect( m_asked ).toHaveLength( 1 );
		expect( m_asked[ 0 ]?.message ).toBe(
			"docs/auth/overview.md § setup: set sources to src/auth/errors.ts\n" +
			"Resolves to 1 source, 3 context files, 577 B of 200 KB.\n" +
			"Was: sources from the doc."
		);
		expect( m_asked[ 0 ] ).toMatchObject( { "requestedSchema": { "type": "object", "properties": {} } } );

		// The writer normalizes comment alignment, as in manifest-writer.test.ts
		expect( diffLines( before, await readManifest() ) ).toEqual( {
			"removed": [
				"sources:            # authoritative facts; the doc may only claim what these support",
				"context:            # style, framing, related docs"
			],
			"added": [
				"sources: # authoritative facts; the doc may only claim what these support",
				"context: # style, framing, related docs",
				"  setup:",
				"    sources: [src/auth/errors.ts]"
			]
		} );
	} );

	it( "writes nothing when the user declines or cancels", async () => {

		const before = await readManifest();
		const outcomes = [ [ "decline", "declined" ], [ "cancel", "cancelled" ] ] as const;
		for( const [ action, outcome ] of outcomes ) {
			const client = await connectAnswering( action );
			const result = await callToolJson( client, "set_scope", SETUP_SOURCES );
			expect( result ).toEqual( { "result": outcome, "manifest": MANIFEST } );
			await client.close();
		}
		expect( await readManifest() ).toBe( before );
	} );

	it( "doesn't ask when the change leaves the manifest as it is", async () => {

		const client = await connectAnswering( "accept" );
		const result = await callToolJson( client, "set_scope", {
			"doc": "docs/auth/overview.md",
			"section": "token-refresh",
			"sources": [ "src/auth/refresh.ts" ]
		} );
		expect( result ).toEqual( { "result": "unchanged", "manifest": MANIFEST } );
		expect( m_asked ).toEqual( [] );
	} );

	it( "rejects a decision or token from the AI, since the server asks the user", async () => {

		const client = await connectAnswering( "accept" );
		const output = await callTool( client, "set_scope", { ...SETUP_SOURCES, "user_decision": "accept" } );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toContain( "supports elicitation" );
		expect( m_asked ).toEqual( [] );
	} );

	it( "creates a manifest for an untracked doc, and says so in the message", async () => {

		const client = await connectAnswering( "accept" );
		const result = await callToolJson( client, "set_scope", {
			"doc": "docs/_style.md",
			"sources": [ "docs/_glossary.md" ],
			"type": "guide",
			"status": "draft"
		} );
		expect( result ).toEqual( { "result": "written", "manifest": ".docctx/docs/_style.md.yaml", "created": true } );
		expect( m_asked[ 0 ]?.message.split( "\n" )[ 2 ] ).toBe( "Creates the manifest (guide, draft)." );
		expect( await readFile( path.join( m_scratch, ".docctx/docs/_style.md.yaml" ), "utf8" ) ).toBe(
			"doc: docs/_style.md\ntype: guide\nstatus: draft\n\nsources:\n  - docs/_glossary.md\n"
		);
	} );

	it( "describes removals, replaced context and warnings", async () => {

		const client = await connectAnswering( "decline" );
		await callToolJson( client, "set_scope", {
			"doc": "docs/auth/overview.md",
			"section": "error-codes",
			"sources": null,
			"context": { "replace": [ "docs/missing.md", "docs/gone.md" ] }
		} );
		expect( m_asked[ 0 ]?.message ).toBe(
			"docs/auth/overview.md § error-codes: use the doc's sources; " +
				"replace inherited context with docs/missing.md, docs/gone.md\n" +
			"Resolves to 3 sources, 0 context files, 590 B of 200 KB.\n" +
			"Was: sources src/auth/errors.ts; context docs/_error-format.md. " +
				"Warning: sections.error-codes.context: docs/missing.md matched no files (and 1 more)."
		);
	} );

	it( "refuses to write if the manifest changed while the user decided", async () => {

		m_client = await connectClient( m_scratch, async () => {
			await writeFile( path.join( m_scratch, MANIFEST ), `${await readManifest()}# edited\n` );
			return { "action": "accept" };
		} );
		const output = await callTool( m_client, "set_scope", SETUP_SOURCES );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toContain( "changed while the user was deciding" );
		expect( await readManifest() ).toMatch( /# edited\n$/ );
	} );
} );

describe( "set_scope without elicitation", () => {

	it( "returns a preview and token first, then writes on an accepted decision with that token", async () => {

		const client = await connectWithoutElicitation();
		const before = await readManifest();
		const preview = json( await callTool( client, "set_scope", SETUP_SOURCES ) ) as Record<string, unknown>;
		expect( preview ).toMatchObject( {
			"result": "preview",
			"message": "docs/auth/overview.md § setup: set sources to src/auth/errors.ts\n" +
				"Resolves to 1 source, 3 context files, 577 B of 200 KB.\n" +
				"Was: sources from the doc.",
			"scope": {
				"doc": "docs/auth/overview.md",
				"section": "setup",
				"sources": [ {
					"path": "src/auth/errors.ts",
					"size_bytes": 61,
					"reasons": [ "sections.setup.sources: src/auth/errors.ts" ]
				} ]
			}
		} );
		expect( preview[ "preview_token" ] ).toMatch( /^[0-9a-f]{16}$/ );
		expect( await readManifest() ).toBe( before );

		const written = await callToolJson( client, "set_scope", {
			...SETUP_SOURCES,
			"user_decision": "accept",
			"preview_token": preview[ "preview_token" ]
		} );
		expect( written ).toEqual( { "result": "written", "manifest": MANIFEST, "created": false } );
		expect( await readManifest() ).toContain( "  setup:\n    sources: [src/auth/errors.ts]\n" );
	} );

	it( "writes nothing on a declined decision", async () => {

		const client = await connectWithoutElicitation();
		const before = await readManifest();
		const preview = await callToolJson( client, "set_scope", SETUP_SOURCES ) as Record<string, unknown>;
		const declined = await callToolJson( client, "set_scope", {
			...SETUP_SOURCES,
			"user_decision": "decline",
			"preview_token": preview[ "preview_token" ]
		} );
		expect( declined ).toEqual( { "result": "declined", "manifest": MANIFEST } );
		expect( await readManifest() ).toBe( before );
	} );

	it( "refuses a decision without a token, so the preview can't be skipped", async () => {

		const client = await connectWithoutElicitation();
		const output = await callTool( client, "set_scope", { ...SETUP_SOURCES, "user_decision": "accept" } );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toContain( "needs the preview_token" );
	} );

	it( "refuses a token once the proposal, the manifest or the resolved files changed", async () => {

		const client = await connectWithoutElicitation();
		const preview = await callToolJson( client, "set_scope", SETUP_SOURCES ) as Record<string, unknown>;
		const token = preview[ "preview_token" ];

		const otherProposal = await callTool( client, "set_scope", {
			...SETUP_SOURCES,
			"sources": [ "src/auth/refresh.ts" ],
			"user_decision": "accept",
			"preview_token": token
		} );
		expect( otherProposal.isError ).toBe( true );
		expect( otherProposal.texts[ 0 ] ).toContain( "changed since that preview" );

		await writeFile( path.join( m_scratch, "docs/_new-context.md" ), "# New\n" );
		const broadened = { ...SETUP_SOURCES, "context": [ "docs/_*.md" ] };
		const broadPreview = await callToolJson( client, "set_scope", broadened ) as Record<string, unknown>;
		await writeFile( path.join( m_scratch, "docs/_another.md" ), "# Another\n" );
		const filesChanged = await callTool( client, "set_scope", {
			...broadened,
			"user_decision": "accept",
			"preview_token": broadPreview[ "preview_token" ]
		} );
		expect( filesChanged.isError ).toBe( true );

		await writeFile( path.join( m_scratch, MANIFEST ), `${await readManifest()}# edited\n` );
		const manifestChanged = await callTool( client, "set_scope", {
			...SETUP_SOURCES,
			"user_decision": "accept",
			"preview_token": token
		} );
		expect( manifestChanged.isError ).toBe( true );
		expect( await readManifest() ).not.toContain( "setup:" );
	} );

	it( "treats a normalized doc path as the same proposal", async () => {

		const client = await connectWithoutElicitation();
		const preview = await callToolJson( client, "set_scope", SETUP_SOURCES ) as Record<string, unknown>;
		const written = await callToolJson( client, "set_scope", {
			...SETUP_SOURCES,
			"doc": "./docs/auth/overview.md",
			"user_decision": "accept",
			"preview_token": preview[ "preview_token" ]
		} );
		expect( written ).toMatchObject( { "result": "written" } );
	} );
} );

describe( "set_scope errors", () => {

	it( "lists the workspace's types and statuses for an untracked doc", async () => {

		const client = await connectWithoutElicitation();
		const output = await callTool( client, "set_scope", { "doc": "docs/_style.md", "sources": [ "src/**" ] } );
		expect( output ).toEqual( {
			"isError": true,
			"texts": [
				"docs/_style.md is not tracked yet. Pass type and status to create its manifest. Types and their " +
				"statuses: reference (draft, review, published, deprecated); guide (draft, review, published, " +
				"deprecated); plan (draft, proposed, decided, superseded)."
			]
		} );
	} );

	it( "needs type and status together, and audience only with them", async () => {

		const client = await connectWithoutElicitation();
		const typeOnly = await callTool( client, "set_scope", { "doc": "docs/_style.md", "type": "guide" } );
		expect( typeOnly.texts[ 0 ] ).toBe( "Pass type and status together; they create the doc's manifest." );
		const audienceOnly = await callTool( client, "set_scope", { "doc": "docs/_style.md", "audience": "admins" } );
		expect( audienceOnly.texts[ 0 ] ).toContain( "needs type and status too" );
	} );

	it( "refuses a type or status that differs from the tracked doc's", async () => {

		const client = await connectWithoutElicitation();
		const output = await callTool( client, "set_scope", { ...SETUP_SOURCES, "type": "guide", "status": "review" } );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toBe(
			"docs/auth/overview.md is already tracked, and its type is reference, not guide. " +
			"Type, status and audience only apply to a new manifest; edit the manifest to change them."
		);
	} );

	it( "refuses a section that isn't a heading, and patterns outside the workspace", async () => {

		const client = await connectWithoutElicitation();
		const section = await callTool( client, "set_scope", { ...SETUP_SOURCES, "section": "install" } );
		expect( section.texts[ 0 ] ).toContain( "has no section \"install\"" );
		const outside = await callTool( client, "set_scope", { ...SETUP_SOURCES, "sources": [ "../secrets/**" ] } );
		expect( outside.isError ).toBe( true );
		expect( outside.texts[ 0 ] ).toContain( "outside the workspace" );
	} );
} );
