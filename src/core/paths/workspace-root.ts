import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { isAbsoluteOnAnyPlatform } from "./absolute-path.js";
import { PathOutsideWorkspaceError } from "./path-outside-workspace-error.js";

/**
 * A path confined to the workspace root.
 */
export interface ConfinedPath {

	/** Workspace-relative, normalized, with forward slashes. `.` for the root itself. */
	readonly relative: string;

	/** Real absolute path with symlinks followed. The only form to pass to `fs`. */
	readonly absolute: string;
}

/**
 * The workspace root, and the single place where paths are confined to it (DESIGN.md §18).
 * Every path from a manifest, tool argument or CLI argument goes through `resolve`.
 */
export class WorkspaceRoot {

	private readonly m_realRoot: string;

	private constructor( realRoot: string ) {
		this.m_realRoot = realRoot;
	}

	/**
	 * Opens a workspace root. The directory must exist; symlinks in its own path are followed.
	 */
	static async open( dir: string ): Promise<WorkspaceRoot> {
		return new WorkspaceRoot( await realpath( dir ) );
	}

	/** Real absolute path of the root. */
	get absolute(): string {
		return this.m_realRoot;
	}

	/**
	 * Confines a workspace-relative path to the root. The target need not exist, so write
	 * targets can be checked too.
	 *
	 * @param input Relative to the root. Backslashes are treated as separators on every OS,
	 *     so manifests stay portable.
	 * @throws PathOutsideWorkspaceError when the path is invalid, absolute, escapes the root
	 *     lexically, or leads outside it through a symlink.
	 */
	async resolve( input: string ): Promise<ConfinedPath> {

		if( input.length === 0 || input.includes( "\0" ) ) {
			throw new PathOutsideWorkspaceError( input, "invalid" );
		}

		const slashed = input.replaceAll( "\\", "/" );
		if( isAbsoluteOnAnyPlatform( slashed ) ) {
			throw new PathOutsideWorkspaceError( input, "absolute" );
		}

		let relative = path.posix.normalize( slashed );
		if( relative.length > 1 && relative.endsWith( "/" ) ) {
			relative = relative.slice( 0, -1 );
		}
		if( relative === ".." || relative.startsWith( "../" ) ) {
			throw new PathOutsideWorkspaceError( input, "escapes-root" );
		}

		const lexical = path.join( this.m_realRoot, ...relative.split( "/" ) );
		const real = await this.realpathAllowingMissing( input, lexical );
		if( !isInside( this.m_realRoot, real ) ) {
			throw new PathOutsideWorkspaceError( input, "symlink-escape" );
		}
		return { "relative": relative, "absolute": real };
	}

	/**
	 * Follows symlinks in `target`. When the target or some of its ancestors don't exist, the
	 * nearest existing ancestor is resolved and the missing tail is appended unchanged. A
	 * dangling or looping symlink on the way is rejected, since writing through it could land
	 * anywhere.
	 */
	private async realpathAllowingMissing( input: string, target: string ): Promise<string> {

		const missing: string[] = [];
		let current = target;
		for( ;; ) {
			try {
				const real = await realpath( current );
				return path.join( real, ...missing );
			} catch( error ) {
				if( errorCode( error ) === "ELOOP" ) {
					throw new PathOutsideWorkspaceError( input, "symlink-escape" );
				}
				if( !isMissing( error ) ) {
					throw error;
				}
			}

			// Either `current` doesn't exist, or it is a symlink whose target doesn't
			if( await isSymlink( current ) ) {
				throw new PathOutsideWorkspaceError( input, "symlink-escape" );
			}

			// The root exists, so this only triggers if it was removed while resolving
			const parent = path.dirname( current );
			if( parent === current || !isInside( this.m_realRoot, parent ) ) {
				throw new Error( `Workspace root no longer exists: ${this.m_realRoot}` );
			}
			missing.unshift( path.basename( current ) );
			current = parent;
		}
	}
}

function isInside( root: string, target: string ): boolean {

	const relative = path.relative( root, target );
	if( relative === "" ) {
		return true;
	}
	return (
		relative !== ".." &&
		!relative.startsWith( `..${path.sep}` ) &&
		!path.isAbsolute( relative )
	);
}

async function isSymlink( target: string ): Promise<boolean> {

	try {
		const stats = await lstat( target );
		return stats.isSymbolicLink();
	} catch( error ) {
		if( isMissing( error ) ) {
			return false;
		}
		throw error;
	}
}

function isMissing( error: unknown ): boolean {

	const code = errorCode( error );
	return code === "ENOENT" || code === "ENOTDIR";
}

function errorCode( error: unknown ): string | undefined {

	if( error instanceof Error && "code" in error && typeof error.code === "string" ) {
		return error.code;
	}
	return undefined;
}
