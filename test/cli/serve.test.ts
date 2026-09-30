import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CliIo } from "../../src/cli/cli-io.js";
import { serveApprovals, serveStartDir } from "../../src/cli/commands/serve.js";
import { runCli } from "../../src/cli/program.js";

const CWD = path.resolve( "/work/project" );

function io( env: Record<string, string> ): CliIo {
	return { "cwd": CWD, "env": env, "stdout": () => undefined, "stderr": () => undefined };
}

describe( "serveStartDir", () => {

	it( "prefers --workspace, then DOCCTX_WORKSPACE, then the current directory", () => {

		expect( serveStartDir( io( { "DOCCTX_WORKSPACE": "/from/env" } ), "../flag" ) )
			.toBe( path.resolve( CWD, "../flag" ) );
		expect( serveStartDir( io( { "DOCCTX_WORKSPACE": "/from/env" } ), undefined ) )
			.toBe( path.resolve( "/from/env" ) );
		expect( serveStartDir( io( {} ), undefined ) ).toBe( CWD );
	} );

	it( "resolves a relative DOCCTX_WORKSPACE against the current directory and ignores an empty one", () => {

		expect( serveStartDir( io( { "DOCCTX_WORKSPACE": "docs" } ), undefined ) ).toBe( path.join( CWD, "docs" ) );
		expect( serveStartDir( io( { "DOCCTX_WORKSPACE": "" } ), undefined ) ).toBe( CWD );
	} );
} );

describe( "serveApprovals", () => {

	it( "prefers --approvals, then DOCCTX_APPROVALS, then auto", () => {

		expect( serveApprovals( io( { "DOCCTX_APPROVALS": "auto" } ), "chat" ) ).toBe( "chat" );
		expect( serveApprovals( io( { "DOCCTX_APPROVALS": "chat" } ), undefined ) ).toBe( "chat" );
		expect( serveApprovals( io( { "DOCCTX_APPROVALS": "" } ), undefined ) ).toBe( "auto" );
		expect( serveApprovals( io( {} ), undefined ) ).toBe( "auto" );
	} );

	it( "rejects an unknown mode as a usage error, before serving", async () => {

		let stderr = "";
		const output = {
			"stdout": () => undefined,
			"stderr": ( text: string ) => {
				stderr += text;
			}
		};
		const fromEnv = await runCli( [ "serve" ], { "cwd": CWD, "env": { "DOCCTX_APPROVALS": "forms" }, ...output } );
		expect( fromEnv ).toBe( 2 );
		expect( stderr ).toContain( "DOCCTX_APPROVALS must be one of auto, chat, not \"forms\"" );

		stderr = "";
		const fromFlag = await runCli( [ "serve", "--approvals", "forms" ], { "cwd": CWD, "env": {}, ...output } );
		expect( fromFlag ).toBe( 2 );
		expect( stderr ).toContain( "Allowed choices are auto, chat" );
	} );
} );
