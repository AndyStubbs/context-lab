/**
 * Thrown when no directory at or above the start directory contains `.docctx/`.
 */
export class WorkspaceNotFoundError extends Error {

	private readonly m_startDir: string;

	constructor( startDir: string ) {

		super( `No .docctx/ directory found in ${startDir} or any parent directory` );
		this.name = "WorkspaceNotFoundError";
		this.m_startDir = startDir;
	}

	/** The directory the search started from. */
	get startDir(): string {
		return this.m_startDir;
	}
}
