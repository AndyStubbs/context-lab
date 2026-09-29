import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { callToolJson, connectClient } from "../../helpers/mcp-client.js";
import { copyFixture, fixturePath, removeScratch } from "../../helpers/scratch-fixture.js";

let m_client: Client | undefined;
let m_scratch: string | undefined;

afterEach( async () => {

	await m_client?.close();
	if( m_scratch !== undefined ) {
		await removeScratch( m_scratch );
	}
	m_client = undefined;
	m_scratch = undefined;
} );

async function connect( startDir: string ): Promise<Client> {

	m_client = await connectClient( startDir );
	return m_client;
}

describe( "get_status", () => {

	it( "summarizes the workspace by type and status, in lifecycle order", async () => {

		const client = await connect( fixturePath( "scope" ) );
		expect( await callToolJson( client, "get_status", {} ) ).toEqual( {
			"workspace": fixturePath( "scope" ),
			"docs": {
				"guide": { "draft": [ "docs/guide.md" ] },
				"reference": { "draft": [ "api/openapi.yaml" ], "published": [ "docs/reference.md" ] },
				"plan": { "decided": [ "plans/current.md" ], "superseded": [ "plans/old.md" ] }
			},
			"problems": [],
			"orphaned_sections": {},
			"missing_docs": []
		} );
	} );

	it( "lists problem manifests in full, orphaned section keys and missing docs", async () => {

		m_scratch = await copyFixture( "basic" );
		await writeFile( path.join( m_scratch, ".docctx/docs/auth/tokens.md.yaml" ), "doc: docs/auth/tokens.md\n" );
		await writeFile( path.join( m_scratch, "docs/auth/overview.md" ), "# Overview\n\n## Error codes\n" );
		await rm( path.join( m_scratch, "plans/auth-v2.md" ) );

		const client = await connect( m_scratch );
		expect( await callToolJson( client, "get_status", {} ) ).toEqual( {
			"workspace": m_scratch,
			"docs": {
				"reference": { "review": [ "docs/auth/overview.md" ] },
				"plan": { "decided": [ "plans/auth-v2.md" ] }
			},
			"problems": [ {
				"manifest": ".docctx/docs/auth/tokens.md.yaml",
				"doc": "docs/auth/tokens.md",
				"message": ".docctx/docs/auth/tokens.md.yaml:1:1: missing required field `type`\n" +
					".docctx/docs/auth/tokens.md.yaml:1:1: missing required field `status`"
			} ],
			"orphaned_sections": { "docs/auth/overview.md": [ "token-refresh" ] },
			"missing_docs": [ "plans/auth-v2.md" ]
		} );
	} );

	it( "returns a tracked doc's outline with keys, titles and line ranges", async () => {

		const client = await connect( fixturePath( "basic" ) );
		const status = await callToolJson( client, "get_status", { "doc": "docs/auth/overview.md" } );
		expect( status ).toEqual( {
			"doc": "docs/auth/overview.md",
			"tracked": true,
			"type": "reference",
			"status": "review",
			"kind": "markdown",
			"lines": 27,
			"sections": [
				{
					"key": "authentication-overview",
					"title": "Authentication overview",
					"depth": 1,
					"lines": [ 1, 27 ]
				},
				{ "key": "token-refresh", "title": "Token refresh", "depth": 2, "lines": [ 5, 9 ] },
				{ "key": "error-codes", "title": "Error codes", "depth": 2, "lines": [ 10, 16 ] },
				{ "key": "setup", "title": "Setup", "depth": 2, "lines": [ 17, 22 ] },
				{ "key": "setup/install", "title": "Install", "depth": 3, "lines": [ 19, 22 ] },
				{ "key": "upgrade", "title": "Upgrade", "depth": 2, "lines": [ 23, 27 ] },
				{ "key": "upgrade/install", "title": "Install", "depth": 3, "lines": [ 25, 27 ] }
			],
			"orphaned_sections": [],
			"warnings": []
		} );

		// Type and status follow the doc, so the most useful fields come first
		expect( Object.keys( status as object ).slice( 0, 4 ) ).toEqual( [ "doc", "tracked", "type", "status" ] );
	} );

	it( "returns an untracked doc's outline, and a single-unit doc with no sections", async () => {

		const client = await connect( fixturePath( "scope" ) );
		expect( await callToolJson( client, "get_status", { "doc": "docs/_style.md" } ) ).toEqual( {
			"doc": "docs/_style.md",
			"tracked": false,
			"kind": "markdown",
			"lines": 3,
			"sections": [ { "key": "style", "title": "Style", "depth": 1, "lines": [ 1, 3 ] } ],
			"orphaned_sections": [],
			"warnings": []
		} );
		expect( await callToolJson( client, "get_status", { "doc": "api/openapi.yaml" } ) )
			.toMatchObject( { "tracked": true, "kind": "single", "sections": [] } );
	} );
} );
