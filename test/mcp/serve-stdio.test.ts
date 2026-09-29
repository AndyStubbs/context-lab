import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { ElicitHandler } from "../helpers/mcp-client.js";
import { callToolJson, createClient } from "../helpers/mcp-client.js";
import { copyFixture, fixturePath, removeScratch } from "../helpers/scratch-fixture.js";

const REPO_ROOT = fileURLToPath( new URL( "../..", import.meta.url ) );
const MAIN = path.join( REPO_ROOT, "dist/cli/main.js" );
const TSC = path.join( REPO_ROOT, "node_modules/typescript/bin/tsc" );
const SETUP_SOURCES = { "doc": "docs/auth/overview.md", "section": "setup", "sources": [ "src/auth/errors.ts" ] };

/** What a `docctx serve` process wrote and how it ended. */
interface ProcessResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Runs `docctx serve` from `dist/`, writes `input` to its stdin, closes it, and waits for the
 * process to exit.
 */
async function runServe( args: readonly string[], input: string, cwd = REPO_ROOT ): Promise<ProcessResult> {

	// An inherited DOCCTX_WORKSPACE would override the working directory
	const env = { ...process.env, "DOCCTX_WORKSPACE": "" };
	const child = spawn( process.execPath, [ MAIN, "serve", ...args ], { "cwd": cwd, "env": env } );
	let stdout = "";
	let stderr = "";
	child.stdout.on( "data", ( chunk: Buffer ) => {
		stdout += chunk.toString( "utf8" );
	} );
	child.stderr.on( "data", ( chunk: Buffer ) => {
		stderr += chunk.toString( "utf8" );
	} );
	const exited = new Promise<number | null>( ( resolve ) => {
		child.once( "close", resolve );
	} );
	child.stdin.end( input );
	return { "code": await exited, "stdout": stdout, "stderr": stderr };
}

/** Connects an SDK client to `docctx serve` from `dist/`, over stdio, for `workspace`. */
async function connectStdio( workspace: string, elicit?: ElicitHandler ): Promise<Client> {

	const client = createClient( elicit );
	await client.connect( new StdioClientTransport( {
		"command": process.execPath,
		"args": [ MAIN, "serve", "--workspace", workspace ],
		"stderr": "ignore"
	} ) );
	return client;
}

function request( id: number, method: string, params: Record<string, unknown> ): string {
	return `${JSON.stringify( { "jsonrpc": "2.0", "id": id, "method": method, "params": params } )}\n`;
}

// The stdio run is the real thing: the compiled server as a client launches it
beforeAll( async () => {
	await promisify( execFile )( process.execPath, [ TSC, "-p", "tsconfig.build.json" ], { "cwd": REPO_ROOT } );
}, 120000 );

describe( "docctx serve over stdio", () => {

	it( "serves the tools to an SDK client, with nothing but JSON-RPC on stdout", async () => {

		const transport = new StdioClientTransport( {
			"command": process.execPath,
			"args": [ MAIN, "serve", "--workspace", fixturePath( "basic" ) ],
			"stderr": "pipe"
		} );
		let stderr = "";
		transport.stderr?.on( "data", ( chunk: Buffer ) => {
			stderr += chunk.toString( "utf8" );
		} );
		const errors: Error[] = [];
		const client = new Client( { "name": "docctx-test", "version": "0.0.0" } );
		client.onerror = ( error ) => {
			errors.push( error );
		};
		await client.connect( transport );
		try {
			const { tools } = await client.listTools();
			expect( tools.map( ( tool ) => tool.name ) )
				.toEqual( [ "get_status", "read_section", "get_scope", "set_scope" ] );
			const status = await callToolJson( client, "get_status", {} );
			expect( status ).toMatchObject( { "workspace": fixturePath( "basic" ) } );
			const args = { "doc": "docs/auth/overview.md", "content": true };
			const scope = await callToolJson( client, "get_scope", args );
			expect( scope ).toMatchObject( { "doc": "docs/auth/overview.md" } );
		} finally {
			await client.close();
		}

		// A stray write to stdout would reach the client as a line it can't parse
		expect( errors ).toEqual( [] );
		expect( stderr ).toContain( "contextlabs: serving the workspace at" );
	} );

	it( "answers calls still in flight when stdin closes, then exits 0", async () => {

		const input = request( 1, "initialize", {
			"protocolVersion": "2025-06-18",
			"capabilities": {},
			"clientInfo": { "name": "docctx-test", "version": "0.0.0" }
		} ) + request( 2, "tools/call", { "name": "get_status", "arguments": {} } );
		const result = await runServe( [ "--workspace", fixturePath( "basic" ) ], input );
		expect( result.code ).toBe( 0 );
		const lines = result.stdout.trim().split( "\n" );
		const ids = lines.map( ( line ) => ( JSON.parse( line ) as { readonly id: number } ).id );
		expect( ids.sort() ).toEqual( [ 1, 2 ] );
	} );

	it( "starts without a workspace and says so on stderr", async () => {

		const empty = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-serve-" ) ) );
		try {
			const result = await runServe( [], "", empty );
			expect( result ).toMatchObject( { "code": 0, "stdout": "" } );
			expect( result.stderr ).toContain( "No .docctx/ directory found" );
		} finally {
			await rm( empty, { "recursive": true, "force": true } );
		}
	} );

	it( "writes a scope the user approves through elicitation", async () => {

		const scratch = await copyFixture( "basic" );
		try {
			const asked: string[] = [];
			const client = await connectStdio( scratch, ( params ) => {
				asked.push( params.message );
				return { "action": "accept" };
			} );
			try {
				const written = await callToolJson( client, "set_scope", SETUP_SOURCES );
				expect( written ).toMatchObject( { "result": "written" } );
			} finally {
				await client.close();
			}
			expect( asked ).toHaveLength( 1 );
			const manifest = await readFile( path.join( scratch, ".docctx/docs/auth/overview.md.yaml" ), "utf8" );
			expect( manifest ).toContain( "  setup:\n    sources: [src/auth/errors.ts]\n" );
		} finally {
			await removeScratch( scratch );
		}
	} );

	it( "writes a scope the user approves in chat, through the preview token", async () => {

		const scratch = await copyFixture( "basic" );
		try {
			const client = await connectStdio( scratch );
			try {
				const preview = await callToolJson( client, "set_scope", SETUP_SOURCES ) as Record<string, unknown>;
				expect( preview[ "result" ] ).toBe( "preview" );
				const written = await callToolJson( client, "set_scope", {
					...SETUP_SOURCES,
					"user_decision": "accept",
					"preview_token": preview[ "preview_token" ]
				} );
				expect( written ).toMatchObject( { "result": "written" } );
			} finally {
				await client.close();
			}
		} finally {
			await removeScratch( scratch );
		}
	} );
} );
