/**
 * Thrown when a scope change for a tracked doc carries a type, status or audience that
 * differs from its manifest's. Those fields only create a manifest; no tool changes them on an
 * existing one (ROADMAP.md Phase 3, PR 2 decision 1).
 */
export class TrackedFieldsError extends Error {

	private readonly m_doc: string;

	/**
	 * @param differences Each differing field, as `type is reference, not guide`.
	 */
	constructor( doc: string, differences: readonly string[] ) {

		super(
			`${doc} is already tracked, and its ${differences.join( "; " )}. ` +
			"Type, status and audience only apply to a new manifest; edit the manifest to change them."
		);
		this.name = "TrackedFieldsError";
		this.m_doc = doc;
	}

	/** The normalized workspace-relative doc path. */
	get doc(): string {
		return this.m_doc;
	}
}
