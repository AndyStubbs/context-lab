import { sectionHash } from "../core/sections/section-hash.js";
import type { SectionText } from "../core/sections/load-section.js";

/**
 * The header line for a section's text, as `read_section` returns it and the prompts embed it:
 * the doc, the key and line range for a section, and the hash `write_section` needs back.
 */
export function sectionLabel( loaded: SectionText ): string {

	const doc = loaded.outline.doc;
	const hash = sectionHash( loaded.text );
	if( loaded.section === undefined ) {
		return `${doc} (hash ${hash})`;
	}
	const section = loaded.section;
	return `${doc} § ${section.key} (lines ${section.startLine}-${section.endLine}, hash ${hash})`;
}

/** Why a whole-doc read was refused: the doc has sections, so one must be named. */
export function needsSectionMessage( doc: string ): string {
	return `${doc} has sections, so pass a section key; get_status with this doc lists them.`;
}
