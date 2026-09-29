import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "../fs/write-file-atomic.js";
import type { HistoryVersion } from "../history/section-history.js";
import { SectionHistory } from "../history/section-history.js";
import { readDocManifest } from "../manifest/read-doc-manifest.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import { UnknownSectionError } from "../scope/unknown-section-error.js";
import { UntrackedDocError } from "../scope/untracked-doc-error.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import { buildOutline } from "./build-outline.js";
import type { Section } from "./doc-outline.js";
import { findOrphanedSections } from "./orphaned-sections.js";
import { sectionHash } from "./section-hash.js";
import { SectionWriteError } from "./section-write-error.js";
import { sliceLines } from "./slice-lines.js";

/** What a section write did. */
export interface SectionWritten {

	/** Normalized workspace-relative doc path. */
	readonly doc: string;

	/** The section as it is now, with its key after any title change; absent for a whole doc. */
	readonly section?: Section;

	/** First and last line of the written text in the doc. */
	readonly lines: readonly [ number, number ];

	/** Where the previous text was saved. */
	readonly history: HistoryVersion;
}

/**
 * Replaces one section of a tracked doc, subsections included, or the whole of a doc without
 * sections. This is the only path that writes a tracked doc (DESIGN.md §18). The previous text
 * is saved to section history first, and the doc is written atomically. It never verifies the
 * section.
 *
 * The new text keeps the doc's line endings, and the section keeps its trailing blank lines
 * (ROADMAP.md Phase 3, PR 3 decision 5).
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @param section Section key. Omit only for a doc without sections.
 * @param baseHash `sectionHash` of the text the caller read, from `read_section`.
 * @throws UntrackedDocError when the doc has no manifest.
 * @throws UnknownSectionError when the section isn't a heading in the doc.
 * @throws SectionWriteError when the write is refused; nothing is written then.
 */
export async function writeSection(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string,
	section: string | undefined,
	text: string,
	baseHash: string
): Promise<SectionWritten> {

	const doc = await root.resolve( docPath );
	const loaded = await readDocManifest( root, config, doc.relative );
	if( loaded === undefined ) {
		throw new UntrackedDocError( doc.relative );
	}
	const current = await readFile( doc.absolute, "utf8" );
	const outline = buildOutline( doc.relative, current );

	let target: Section | undefined;
	let startLine = 1;
	let endLine = outline.lineCount;
	if( section !== undefined ) {
		if( outline.kind === "single" ) {
			throw new UnknownSectionError( outline.doc, section, "no-sections" );
		}
		target = outline.sections.find( ( entry ) => entry.key === section );
		if( target === undefined ) {
			throw new UnknownSectionError( outline.doc, section, "not-a-heading" );
		}
		startLine = target.startLine;
		endLine = target.endLine;
	} else if( outline.sections.length > 0 ) {
		throw new SectionWriteError(
			"has-sections",
			`${outline.doc} has sections, so pass a section key; get_status with this doc lists them.`
		);
	}

	const previous = sliceLines( current, startLine, endLine );
	if( sectionHash( previous ) !== baseHash ) {
		throw new SectionWriteError( "changed", `${describe( outline.doc, target )} changed since it was read. ` +
			"Read it again with read_section, and redo the change against the new text." );
	}

	const replacement = fitReplacement( text, previous, current.includes( "\r\n" ) );
	const updated = replaceLines( current, startLine, endLine, replacement );
	const updatedOutline = buildOutline( outline.doc, updated );
	const replacementLines = countLines( replacement );
	const lastLine = startLine + replacementLines - 1;

	let written: Section | undefined;
	if( target !== undefined ) {
		written = updatedOutline.sections.find( ( entry ) => entry.startLine === startLine );
		checkShape( target, written, lastLine );
	}
	const before = new Set( findOrphanedSections( loaded.manifest, outline ) );
	const orphaned = findOrphanedSections( loaded.manifest, updatedOutline ).filter( ( key ) => !before.has( key ) );
	if( orphaned.length > 0 ) {
		throw new SectionWriteError(
			"orphans",
			`The new text would leave these manifest section keys matching no heading: ${orphaned.join( ", " )}. ` +
			"Keep those headings as they are, or ask the user to rename them by hand and update the manifest."
		);
	}

	const history = await new SectionHistory( root ).save( outline.doc, target?.key, previous );
	await writeFileAtomic( doc.absolute, updated );
	const result = {
		"doc": outline.doc,
		"lines": [ startLine, lastLine ] as const,
		"history": history
	};
	if( written === undefined ) {
		return result;
	}
	return { ...result, "section": written };
}

/**
 * The replacement as it goes into the doc: the doc's line endings, and the trailing blank lines
 * of the text it replaces, so the space before the next heading, or a missing final newline,
 * stays as it was.
 */
function fitReplacement( text: string, previous: string, isCrlf: boolean ): string {

	const trailing = /\s*$/.exec( previous )?.[ 0 ] ?? "";
	const firstBreak = trailing.search( /\r?\n/ );
	let tail = "";
	if( firstBreak !== -1 ) {
		tail = trailing.slice( firstBreak ).replaceAll( "\r\n", "\n" );
	}
	let replacement = `${text.replaceAll( "\r\n", "\n" ).trimEnd()}${tail}`;
	if( isCrlf ) {
		replacement = replacement.replaceAll( "\n", "\r\n" );
	}
	return replacement;
}

/**
 * The new text must be one section at the old section's depth, starting on its first line and
 * ending where the text ends (PR 3 decision 2). Checking the rebuilt doc's outline rather than
 * the text alone also catches an unclosed code fence that would swallow the next heading.
 */
function checkShape( target: Section, written: Section | undefined, lastLine: number ): void {

	if( written === undefined || written.depth !== target.depth ) {
		throw new SectionWriteError(
			"shape",
			`The new text must start with a level ${target.depth} heading, as "${target.title}" does.`
		);
	}
	if( written.endLine !== lastLine ) {
		throw new SectionWriteError(
			"shape",
			`The new text may only contain headings deeper than level ${target.depth}; ` +
			"another at that level or higher, or an unclosed code block, would change the doc's other sections."
		);
	}
}

/** Replaces lines `startLine` to `endLine` (1-based, inclusive) with `replacement`. */
function replaceLines( text: string, startLine: number, endLine: number, replacement: string ): string {

	const lines = text.split( /(?<=\n)/ );
	return [ ...lines.slice( 0, startLine - 1 ), replacement, ...lines.slice( endLine ) ].join( "" );
}

/** Lines in the text; a trailing newline ends the last line rather than starting another. */
function countLines( text: string ): number {

	if( text.length === 0 ) {
		return 0;
	}
	const lines = text.split( "\n" ).length;
	if( text.endsWith( "\n" ) ) {
		return lines - 1;
	}
	return lines;
}

function describe( doc: string, section: Section | undefined ): string {

	if( section === undefined ) {
		return doc;
	}
	return `${doc} § ${section.key}`;
}
