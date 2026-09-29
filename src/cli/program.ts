import { readFileSync } from "node:fs";
import { Command, CommanderError } from "commander";
import { PathOutsideWorkspaceError } from "../core/paths/path-outside-workspace-error.js";
import { ReservedDocPathError } from "../core/manifest/reserved-doc-path-error.js";
import { UnknownSectionError } from "../core/scope/unknown-section-error.js";
import { UntrackedDocError } from "../core/scope/untracked-doc-error.js";
import { WorkspaceNotFoundError } from "../core/workspace/workspace-not-found-error.js";
import { ManifestError } from "../core/yaml/manifest-error.js";
import type { CliIo } from "./cli-io.js";
import { registerInitCommand } from "./commands/init.js";
import { registerScopeCommand } from "./commands/scope.js";
import { registerServeCommand } from "./commands/serve.js";

/** Exit codes shared by every command (CONV_TYPESCRIPT.md, CLI). */
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

/**
 * Builds the `docctx` command line program. Subcommands are added as their phases land
 * (ROADMAP.md).
 */
export function createProgram( io: CliIo ): Command {

	// Output and exit settings go first, so subcommands inherit them
	const version = readPackageVersion();
	const program = new Command();
	program
		.name( "docctx" )
		.description( "Declare the sources and context for each doc and section, and flag stale sections." )
		.version( version )
		.exitOverride()
		.configureOutput( { "writeOut": io.stdout, "writeErr": io.stderr } );
	registerInitCommand( program, io );
	registerScopeCommand( program, io );
	registerServeCommand( program, io, version );
	return program;
}

/**
 * Runs `docctx` with `argv` (without the node and script paths) and returns the exit code:
 * 0 for success, 1 for an error such as an untracked doc or an invalid manifest, 2 for a
 * usage error. Expected errors are written to stderr; anything else is rethrown.
 */
export async function runCli( argv: readonly string[], io: CliIo ): Promise<number> {

	try {
		await createProgram( io ).parseAsync( [ ...argv ], { "from": "user" } );
		return EXIT_OK;
	} catch( error ) {

		// Commander has already printed its own message, or the help or version
		if( error instanceof CommanderError ) {
			if( error.exitCode === 0 ) {
				return EXIT_OK;
			}
			return EXIT_USAGE;
		}
		const message = describeError( error );
		if( message === undefined ) {
			throw error;
		}
		io.stderr( `docctx: ${message}\n` );
		return EXIT_ERROR;
	}
}

function describeError( error: unknown ): string | undefined {

	if(
		error instanceof ManifestError || error instanceof PathOutsideWorkspaceError ||
		error instanceof ReservedDocPathError || error instanceof UntrackedDocError ||
		error instanceof UnknownSectionError || error instanceof WorkspaceNotFoundError
	) {
		return error.message;
	}
	if( error instanceof Error && ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
		const missing = ( error as NodeJS.ErrnoException ).path ?? "";
		return `no such file or directory: ${missing}`;
	}
	return undefined;
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
