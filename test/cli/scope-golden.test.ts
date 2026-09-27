import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runDocctx } from "../helpers/cli-run.js";

/** The same cases as the core golden files in test/core/scope/. */
const CASES: Readonly<Record<string, readonly ( readonly [ string, string? ] )[]>> = {
	"basic": [
		[ "docs/auth/overview.md" ],
		[ "docs/auth/overview.md", "token-refresh" ],
		[ "docs/auth/overview.md", "error-codes" ],
		[ "docs/auth/overview.md", "setup/install" ],
		[ "docs/auth/tokens.md" ],
		[ "plans/auth-v2.md" ]
	],
	"scope": [
		[ "docs/guide.md" ],
		[ "docs/guide.md", "install" ],
		[ "docs/guide.md", "configure" ],
		[ "docs/guide.md", "legacy" ],
		[ "docs/reference.md" ],
		[ "plans/current.md" ],
		[ "api/openapi.yaml" ]
	]
};

/** `docs/auth/overview.md` + `setup/install` → `docs__auth__overview.md@setup__install.txt` */
function goldenName( doc: string, section?: string ): string {

	let name = doc.replaceAll( "/", "__" );
	if( section !== undefined ) {
		name += `@${section.replaceAll( "/", "__" )}`;
	}
	return `${name}.txt`;
}

describe( "docctx scope golden files", () => {

	for( const [ fixture, cases ] of Object.entries( CASES ) ) {
		for( const [ doc, section ] of cases ) {
			const argv = [ "scope", doc ];
			if( section !== undefined ) {
				argv.push( section );
			}
			it( `${fixture}: ${argv.slice( 1 ).join( " " )}`, async () => {

				const cwd = fileURLToPath( new URL( `../fixtures/${fixture}`, import.meta.url ) );
				const result = await runDocctx( cwd, ...argv );
				expect( result.stderr ).toBe( "" );
				expect( result.code ).toBe( 0 );
				const golden = `__golden__/${fixture}/${goldenName( doc, section )}`;
				await expect( result.stdout ).toMatchFileSnapshot( golden );
			} );
		}
	}
} );
