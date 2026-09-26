/**
 * Thrown when asked for the manifest of a doc path that can't be tracked, because its
 * metadata would collide with ContextLabs' own files (DESIGN.md §7).
 */
export class ReservedDocPathError extends Error {

	private readonly m_path: string;

	constructor( path: string ) {

		super( `Doc path is reserved and can't be tracked: ${JSON.stringify( path )}` );
		this.name = "ReservedDocPathError";
		this.m_path = path;
	}

	/** The normalized workspace-relative doc path. */
	get path(): string {
		return this.m_path;
	}
}
