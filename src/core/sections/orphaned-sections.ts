import type { DocManifest } from "../manifest/doc-manifest.js";
import type { DocOutline } from "./doc-outline.js";

/**
 * Manifest section keys that match no section in the doc, in manifest order. They are
 * reported, never dropped (DESIGN.md §10). Every key is orphaned for a single-unit doc, which
 * has no sections.
 */
export function findOrphanedSections( manifest: DocManifest, outline: DocOutline ): readonly string[] {

	const keys = new Set( outline.sections.map( ( section ) => section.key ) );
	return [ ...manifest.sections.keys() ].filter( ( key ) => !keys.has( key ) );
}
