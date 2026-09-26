import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";

describe( "createProgram", () => {

	it( "reports the package version", async () => {

		const packageJson: unknown = JSON.parse(
			await readFile( new URL( "../../package.json", import.meta.url ), "utf8" )
		);
		let output = "";
		const program = createProgram()
			.exitOverride()
			.configureOutput( {
				"writeOut": ( text ) => {
					output += text;
				}
			} );

		await expect( program.parseAsync( [ "--version" ], { "from": "user" } ) ).rejects.toThrow();
		expect( packageJson ).toMatchObject( { "version": output.trim() } );
	} );
} );
