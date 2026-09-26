import type { Document, Node } from "yaml";
import { LineCounter, parseDocument, visit } from "yaml";
import type { ManifestIssue } from "./manifest-error.js";
import { ManifestError } from "./manifest-error.js";

/**
 * A parsed YAML file that can map any of its nodes back to a line and column. Keeps the
 * `Document`, so a writer can edit it without losing comments (CONV_TYPESCRIPT.md, YAML).
 */
export class YamlFile {

	private readonly m_file: string;
	private readonly m_text: string;
	private readonly m_document: Document.Parsed;
	private readonly m_lineCounter: LineCounter;

	private constructor(
		file: string,
		text: string,
		document: Document.Parsed,
		lineCounter: LineCounter
	) {

		this.m_file = file;
		this.m_text = text;
		this.m_document = document;
		this.m_lineCounter = lineCounter;
	}

	/**
	 * Parses one YAML document. Uses the YAML 1.2 core schema, so dates and timestamps stay
	 * strings.
	 *
	 * @param file Workspace-relative path, used in error messages.
	 * @throws ManifestError on syntax errors, duplicate keys, multiple documents or aliases.
	 */
	static parse( file: string, text: string ): YamlFile {

		const lineCounter = new LineCounter();
		const document = parseDocument( text, { "lineCounter": lineCounter, "prettyErrors": false } );
		const yamlFile = new YamlFile( file, text, document, lineCounter );

		const issues: ManifestIssue[] = document.errors.map(
			( error ) => yamlFile.issueAtOffset( error.pos[ 0 ], error.message )
		);

		// Aliases would let one node appear under several keys, which a writer can't update
		// safely, and they are a known way to blow up memory
		visit( document, {
			"Alias": ( _key, node ) => {
				issues.push( yamlFile.issueAt( node, "anchors and aliases are not supported" ) );
			}
		} );

		if( issues.length > 0 ) {
			throw new ManifestError( file, issues );
		}
		return yamlFile;
	}

	/** Workspace-relative path, with forward slashes. */
	get file(): string {
		return this.m_file;
	}

	/** The source text the document was parsed from. */
	get text(): string {
		return this.m_text;
	}

	get document(): Document.Parsed {
		return this.m_document;
	}

	/**
	 * An issue positioned at the start of `node`, or at the start of the file when the node
	 * has no source range.
	 */
	issueAt( node: Node | null | undefined, message: string ): ManifestIssue {

		let offset = 0;
		if( node !== null && node !== undefined && node.range !== null && node.range !== undefined ) {
			offset = node.range[ 0 ];
		}
		return this.issueAtOffset( offset, message );
	}

	private issueAtOffset( offset: number, message: string ): ManifestIssue {

		const position = this.m_lineCounter.linePos( offset );

		// linePos reports line 0 for offsets before the first newline it has seen
		let line = position.line;
		let column = position.col;
		if( line === 0 ) {
			line = 1;
			column = offset + 1;
		}
		return { "file": this.m_file, "line": line, "column": column, "message": message };
	}
}
