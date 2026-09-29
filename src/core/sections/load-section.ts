import { readFile } from "node:fs/promises";
import { readDocManifest } from "../manifest/read-doc-manifest.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import { UnknownSectionError } from "../scope/unknown-section-error.js";
import { UntrackedDocError } from "../scope/untracked-doc-error.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import { buildOutline } from "./build-outline.js";
import type { DocOutline, Section } from "./doc-outline.js";
import { sliceLines } from "./slice-lines.js";

/**
 * The text of one section of a tracked doc, or of the whole doc.
 */
export interface SectionText {
	readonly outline: DocOutline;

	/** Absent when the whole doc was asked for. */
	readonly section?: Section;

	/** Exactly as written, subsections included (DESIGN.md §10). */
	readonly text: string;
}

/**
 * Reads one section of a tracked doc, from its heading through its last subsection. This is
 * the entry point for `read_section`.
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @param section Section key. Omit for the whole doc.
 * @throws UntrackedDocError when the doc has no manifest.
 * @throws UnknownSectionError when the section isn't a heading in the doc.
 * @throws ManifestError when the doc's manifest is invalid.
 */
export async function loadSection(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string,
	section?: string
): Promise<SectionText> {

	const doc = await root.resolve( docPath );
	const loaded = await readDocManifest( root, config, doc.relative );
	if( loaded === undefined ) {
		throw new UntrackedDocError( doc.relative );
	}
	const text = await readFile( doc.absolute, "utf8" );
	const outline = buildOutline( doc.relative, text );
	if( section === undefined ) {
		return { "outline": outline, "text": text };
	}

	if( outline.kind === "single" ) {
		throw new UnknownSectionError( outline.doc, section, "no-sections" );
	}
	const found = outline.sections.find( ( entry ) => entry.key === section );
	if( found === undefined ) {
		throw new UnknownSectionError( outline.doc, section, "not-a-heading" );
	}
	return {
		"outline": outline,
		"section": found,
		"text": sliceLines( text, found.startLine, found.endLine )
	};
}
