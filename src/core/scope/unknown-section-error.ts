/**
 * Why a section can't be resolved:
 * - `not-a-heading`: no heading in the doc has this key
 * - `no-sections`: the doc isn't markdown, so it is a single unit with no sections (§10)
 */
export type UnknownSectionReason = "not-a-heading" | "no-sections";

/**
 * Thrown when asked for the scope of a section the doc doesn't have.
 */
export class UnknownSectionError extends Error {

	private readonly m_doc: string;
	private readonly m_section: string;
	private readonly m_reason: UnknownSectionReason;

	constructor( doc: string, section: string, reason: UnknownSectionReason ) {

		super( describe( doc, section, reason ) );
		this.name = "UnknownSectionError";
		this.m_doc = doc;
		this.m_section = section;
		this.m_reason = reason;
	}

	get doc(): string {
		return this.m_doc;
	}

	get section(): string {
		return this.m_section;
	}

	get reason(): UnknownSectionReason {
		return this.m_reason;
	}
}

function describe( doc: string, section: string, reason: UnknownSectionReason ): string {

	switch( reason ) {
		case "not-a-heading":
			return `${doc} has no section ${JSON.stringify( section )}`;
		case "no-sections":
			return `${doc} is not markdown, so it has no sections`;
	}
}
