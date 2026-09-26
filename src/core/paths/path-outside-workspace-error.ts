/**
 * Why a path was refused:
 * - `invalid`: empty, contains a NUL byte, or is a negated (`!`) glob pattern
 * - `absolute`: an absolute path on any platform; workspace paths are always relative
 * - `escapes-root`: resolves outside the workspace root before following symlinks
 * - `symlink-escape`: a symlink along the path leads outside the root, dangles or loops
 */
export type PathRejectionReason = "invalid" | "absolute" | "escapes-root" | "symlink-escape";

/**
 * Thrown when a path from a manifest, tool argument or CLI argument is not confined to the
 * workspace root (DESIGN.md §18).
 */
export class PathOutsideWorkspaceError extends Error {

	private readonly m_path: string;
	private readonly m_reason: PathRejectionReason;

	constructor( path: string, reason: PathRejectionReason ) {

		super( `Path is outside the workspace (${reason}): ${JSON.stringify( path )}` );
		this.name = "PathOutsideWorkspaceError";
		this.m_path = path;
		this.m_reason = reason;
	}

	/** The path as it was given, before any normalization. */
	get path(): string {
		return this.m_path;
	}

	get reason(): PathRejectionReason {
		return this.m_reason;
	}
}
