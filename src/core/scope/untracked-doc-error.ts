/**
 * Thrown when asked for the scope of a doc that has no manifest (DESIGN.md §7).
 */
export class UntrackedDocError extends Error {

	private readonly m_doc: string;

	constructor( doc: string ) {

		super( `Doc is not tracked (it has no manifest): ${JSON.stringify( doc )}` );
		this.name = "UntrackedDocError";
		this.m_doc = doc;
	}

	/** The normalized workspace-relative doc path. */
	get doc(): string {
		return this.m_doc;
	}
}
