import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CliIo } from "../../src/cli/cli-io.js";
import { serveStartDir } from "../../src/cli/commands/serve.js";

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
