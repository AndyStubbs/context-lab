import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runDocctx } from "../helpers/cli-run.js";

describe( "runCli", () => {

	it( "reports the package version and exits 0", async () => {

		const packageJson: unknown = JSON.parse(
			await readFile( new URL( "../../package.json", import.meta.url ), "utf8" )
		);
		const result = await runDocctx( process.cwd(), "--version" );
		expect( result.code ).toBe( 0 );
		expect( packageJson ).toMatchObject( { "version": result.stdout.trim() } );
	} );

	it( "exits 2 for an unknown command or option", async () => {

		const command = await runDocctx( process.cwd(), "frobnicate" );
		expect( command.code ).toBe( 2 );
		expect( command.stderr ).toContain( "unknown command 'frobnicate'" );

		const option = await runDocctx( process.cwd(), "scope", "--nope", "a.md" );
		expect( option.code ).toBe( 2 );
		expect( option.stderr ).toContain( "unknown option '--nope'" );
	} );

	it( "shows help with exit 0", async () => {

		const result = await runDocctx( process.cwd(), "scope", "--help" );
		expect( result.code ).toBe( 0 );
		expect( result.stdout ).toContain( "Exit codes: 0 resolved (warnings included), 1 error, 2 usage error." );
	} );
} );
