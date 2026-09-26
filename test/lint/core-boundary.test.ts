import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { coreBoundary } from "../../eslint.config.js";

const m_eslint = new ESLint( {
	"overrideConfigFile": true,
	"overrideConfig": [
		{
			"files": [ "**/*.ts" ],
			"languageOptions": { "parser": tseslint.parser }
		},
		coreBoundary
	]
} );

async function lintImport( filePath: string, specifier: string ): Promise<string[]> {

	const results = await m_eslint.lintText(
		`import { x } from "${specifier}";\nexport { x };\n`,
		{ "filePath": filePath }
	);
	return results.flatMap( ( result ) => result.messages.map( ( message ) => message.ruleId ?? "" ) );
}

describe( "core boundary lint rule", () => {

	it.each( [
		"../mcp/server.js",
		"../../mcp/tools/set-scope.js",
		"../cli/program.js",
		"@modelcontextprotocol/sdk/server/mcp.js",
		"commander"
	] )( "rejects %j imported from src/core/", async ( specifier ) => {
		expect( await lintImport( "src/core/paths/x.ts", specifier ) ).toEqual( [ "no-restricted-imports" ] );
	} );

	it.each( [
		"./workspace-root.js",
		"../scope/scope-resolver.js",
		"node:path"
	] )( "allows %j imported from src/core/", async ( specifier ) => {
		expect( await lintImport( "src/core/paths/x.ts", specifier ) ).toEqual( [] );
	} );

	it( "doesn't restrict the adapters", async () => {
		expect( await lintImport( "src/cli/x.ts", "commander" ) ).toEqual( [] );
	} );
} );
