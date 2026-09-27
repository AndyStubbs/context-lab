import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { loadScope } from "../../../src/core/scope/load-scope.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";

/** Every doc and section with a golden file, per fixture workspace. */
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

/** `docs/auth/overview.md` + `setup/install` → `docs__auth__overview.md@setup__install.json` */
function goldenName( doc: string, section?: string ): string {

	let name = doc.replaceAll( "/", "__" );
	if( section !== undefined ) {
		name += `@${section.replaceAll( "/", "__" )}`;
	}
	return `${name}.json`;
}

describe( "resolved scope golden files", () => {

	for( const [ fixture, cases ] of Object.entries( CASES ) ) {
		for( const [ doc, section ] of cases ) {
			let label = doc;
			if( section !== undefined ) {
				label = `${doc} § ${section}`;
			}
			it( `${fixture}: ${label}`, async () => {

				const fixtureDir = fileURLToPath( new URL( `../../fixtures/${fixture}`, import.meta.url ) );
				const root = await WorkspaceRoot.open( fixtureDir );
				const config = await readWorkspaceConfig( root );
				const scope = await loadScope( root, config, doc, section );
				await expect( `${JSON.stringify( scope, null, "\t" )}\n` )
					.toMatchFileSnapshot( `__golden__/${fixture}/${goldenName( doc, section )}` );
			} );
		}
	}
} );
