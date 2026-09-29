import path from "node:path";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { ManifestWriteError } from "../core/manifest/manifest-write-error.js";
import { ReservedDocPathError } from "../core/manifest/reserved-doc-path-error.js";
import { TrackedFieldsError } from "../core/manifest/tracked-fields-error.js";
import { PathOutsideWorkspaceError } from "../core/paths/path-outside-workspace-error.js";
import type { WorkspaceRoot } from "../core/paths/workspace-root.js";
import { UnknownSectionError } from "../core/scope/unknown-section-error.js";
import { UntrackedDocError } from "../core/scope/untracked-doc-error.js";
import { SectionWriteError } from "../core/sections/section-write-error.js";
import { locateWorkspace } from "../core/workspace/locate-workspace.js";
import { readWorkspaceConfig } from "../core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../core/workspace/workspace-config.js";
import { WorkspaceNotFoundError } from "../core/workspace/workspace-not-found-error.js";
import { ManifestError } from "../core/yaml/manifest-error.js";

/** The workspace a tool call or prompt runs against, read fresh for every call. */
export interface OpenWorkspace {
	readonly root: WorkspaceRoot;
	readonly config: WorkspaceConfig;
}

/**
 * Runs `body` against the workspace found from `startDir`, turning expected failures, such as
 * an untracked doc or an invalid manifest, into a message the model or user can act on.
 * Anything else is logged to stderr and rethrown.
 *
 * The workspace is located on every call, so a workspace created or edited while the server
 * runs is picked up without a restart.
 *
 * @param what Names the call in the stderr log, such as `a tool call`.
 * @param onExpected Turns the message for an expected failure into the call's result, or
 *     throws it in the form the protocol wants.
 */
export async function runInWorkspace<T>(
	startDir: string,
	what: string,
	body: ( workspace: OpenWorkspace ) => Promise<T>,
	onExpected: ( message: string ) => T
): Promise<T> {

	let root: WorkspaceRoot | undefined;
	try {
		root = await locateWorkspace( startDir );
		const config = await readWorkspaceConfig( root );
		return await body( { "root": root, "config": config } );
	} catch( error ) {

		// Already in the protocol's form, such as a prompt refusing its arguments
		if( error instanceof McpError ) {
			throw error;
		}
		const message = describeExpectedError( error, root );
		if( message === undefined ) {
			console.error( `contextlabs: unexpected error in ${what}:`, error );
			throw error;
		}
		return onExpected( message );
	}
}

function describeExpectedError( error: unknown, root: WorkspaceRoot | undefined ): string | undefined {

	if( error instanceof WorkspaceNotFoundError ) {
		return `${error.message}. Start the server inside a workspace, pass --workspace <dir> or ` +
			"set DOCCTX_WORKSPACE, or run `docctx init` to create one.";
	}
	if( error instanceof PathOutsideWorkspaceError ) {
		if( root === undefined ) {
			return error.message;
		}
		return `${error.message}. Paths are relative to the workspace root, ${root.absolute}.`;
	}
	if( error instanceof ManifestWriteError && error.reason === "changed-on-disk" ) {
		return `${error.path} changed while the user was deciding, so nothing was written. ` +
			"Propose the change again.";
	}
	if( error instanceof UnknownSectionError && error.reason === "not-a-heading" ) {
		return `${error.message}. get_status with this doc lists its section keys.`;
	}
	if( error instanceof UntrackedDocError ) {
		return `${error.message}. Propose a scope with set_scope to track it.`;
	}
	if(
		error instanceof UnknownSectionError || error instanceof SectionWriteError ||
		error instanceof ReservedDocPathError || error instanceof ManifestError ||
		error instanceof ManifestWriteError || error instanceof TrackedFieldsError
	) {
		return error.message;
	}
	if( error instanceof Error && ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
		return `No such file: ${relativeTo( root, ( error as NodeJS.ErrnoException ).path ?? "" )}`;
	}
	return undefined;
}

/** The workspace-relative form of an absolute path from an fs error, when it has one. */
function relativeTo( root: WorkspaceRoot | undefined, target: string ): string {

	if( root === undefined || target === "" ) {
		return target;
	}
	const relative = path.relative( root.absolute, target );
	if( relative.startsWith( ".." ) || path.isAbsolute( relative ) ) {
		return target;
	}
	return relative.split( path.sep ).join( "/" );
}
