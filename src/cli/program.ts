import { readFileSync } from "node:fs";
import { Command } from "commander";

/**
 * Builds the `docctx` command line program. Subcommands are added as their phases land
 * (ROADMAP.md).
 */
export function createProgram(): Command {

	const program = new Command();
	program
		.name( "docctx" )
		.description( "Declare the sources and context for each doc and section, and flag stale sections." )
		.version( readPackageVersion() );
	return program;
}

function readPackageVersion(): string {

	// Resolves to the package root from both src/cli/ (tests) and dist/cli/ (installed)
	const url = new URL( "../../package.json", import.meta.url );
	const parsed: unknown = JSON.parse( readFileSync( url, "utf8" ) );
	if(
		typeof parsed === "object" && parsed !== null &&
		"version" in parsed && typeof parsed.version === "string"
	) {
		return parsed.version;
	}
	throw new Error( `No version in ${url.pathname}` );
}
