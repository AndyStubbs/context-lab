import { slug } from "github-slugger";
import type { Heading, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { DocOutline, OutlineWarning, Section } from "./doc-outline.js";
import type { KeyInput } from "./section-keys.js";
import { assignSectionKeys } from "./section-keys.js";

const MARKDOWN_EXTENSIONS = [ ".md", ".markdown" ];

/**
 * True for docs parsed into sections. Everything else is a single unit in v1 (DESIGN.md §10).
 */
export function isMarkdownPath( docPath: string ): boolean {

	const lower = docPath.toLowerCase();
	return MARKDOWN_EXTENSIONS.some( ( extension ) => lower.endsWith( extension ) );
}

/**
 * Builds a doc's section outline from its text (DESIGN.md §10). Only top-level headings start
 * sections: headings inside block quotes or lists don't, and front matter is skipped.
 *
 * @param docPath Normalized workspace-relative doc path; its extension decides whether the
 *     doc is markdown.
 */
export function buildOutline( docPath: string, text: string ): DocOutline {

	const lineCount = countLines( text );
	if( !isMarkdownPath( docPath ) ) {
		return {
			"doc": docPath,
			"kind": "single",
			"sections": [],
			"warnings": [],
			"lineCount": lineCount
		};
	}

	const parser = unified().use( remarkParse ).use( remarkFrontmatter, [ "yaml", "toml" ] );
	const tree: Root = parser.parse( text );
	const headings = tree.children.filter( ( node ): node is Heading => node.type === "heading" );

	// The enclosing heading is the nearest earlier one with a lower level
	const inputs: KeyInput[] = [];
	const stack: { readonly index: number; readonly depth: number }[] = [];
	headings.forEach( ( heading, index ) => {
		while( ( stack[ stack.length - 1 ]?.depth ?? 0 ) >= heading.depth ) {
			stack.pop();
		}
		const parent = stack[ stack.length - 1 ]?.index;
		const input: { slug: string; parent?: number } = { "slug": slug( toString( heading ), false ) };
		if( parent !== undefined ) {
			input.parent = parent;
		}
		inputs.push( input );
		stack.push( { "index": index, "depth": heading.depth } );
	} );

	const assignment = assignSectionKeys( inputs );
	const warnings: OutlineWarning[] = [];
	const sections: Section[] = [];
	headings.forEach( ( heading, index ) => {
		const startLine = heading.position?.start.line ?? 1;
		const key = assignment.keys[ index ];
		if( key === undefined ) {
			warnings.push( { "line": startLine, "message": "heading has no text, so it has no section key" } );
			return;
		}

		// A section runs until the next heading of the same or higher level
		let endLine = lineCount;
		for( const later of headings.slice( index + 1 ) ) {
			if( later.depth <= heading.depth ) {
				endLine = ( later.position?.start.line ?? lineCount + 1 ) - 1;
				break;
			}
		}

		const section: { -readonly [ K in keyof Section ]: Section[ K ] } = {
			"key": key,
			"slug": inputs[ index ]?.slug ?? "",
			"title": toString( heading ),
			"depth": heading.depth,
			"startLine": startLine,
			"endLine": endLine
		};
		const parent = inputs[ index ]?.parent;
		if( parent !== undefined ) {
			const parentKey = assignment.keys[ parent ];
			if( parentKey !== undefined ) {
				section.parentKey = parentKey;
			}
		}
		sections.push( section );
	} );

	for( const entry of assignment.suffixed ) {
		const line = headings[ entry.index ]?.position?.start.line ?? 1;
		const firstLine = headings[ entry.sameAs ]?.position?.start.line ?? 1;
		warnings.push( {
			"line": line,
			"message": `section key \`${assignment.keys[ entry.index ] ?? ""}\` depends on heading order: ` +
				`the heading on line ${firstLine} has the same path`
		} );
	}
	warnings.sort( ( a, b ) => a.line - b.line );
	return {
		"doc": docPath,
		"kind": "markdown",
		"sections": sections,
		"warnings": warnings,
		"lineCount": lineCount
	};
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
