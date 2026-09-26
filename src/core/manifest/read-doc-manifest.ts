import { readFile } from "node:fs/promises";
import type { Node } from "yaml";
import { isMap } from "yaml";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { MapView } from "../yaml/node-reader.js";
import { NodeReader } from "../yaml/node-reader.js";
import { YamlFile } from "../yaml/yaml-file.js";
import type {
	ContextList,
	DocManifest,
	SectionScope,
	VerificationRecord,
	VerifiedBy,
	VerifiedVia
} from "./doc-manifest.js";
import { isReservedDocPath, manifestPathFor } from "./manifest-paths.js";
import { checkGlobs, confinePath } from "./path-fields.js";
import { ReservedDocPathError } from "./reserved-doc-path-error.js";

/**
 * A validated manifest and the YAML file it came from. The file keeps the parsed `Document`,
 * so the manifest writer can edit it without losing comments.
 */
export interface LoadedManifest {
	readonly manifest: DocManifest;
	readonly file: YamlFile;
}

type Writable<T> = { -readonly [K in keyof T]: T[ K ] };

const TOP_LEVEL_KEYS = [
	"doc", "type", "status", "audience", "owner", "sources", "context", "exclude", "sections",
	"verified", "supersedes", "implements_into", "decided_on", "allow_terms"
];
const SECTION_KEYS = [ "sources", "context", "exclude", "verified" ];
const VERIFIED_KEYS = [ "at", "by", "via", "note" ];
const REPLACE_KEYS = [ "replace" ];
const PLAN_TYPE = "plan";
const PLAN_ONLY_KEYS = [ "supersedes", "implements_into", "decided_on" ];
const VERIFIED_BY: readonly VerifiedBy[] = [ "human", "ai" ];
const VERIFIED_VIA: readonly VerifiedVia[] = [ "elicitation", "chat" ];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z$/;

/**
 * Reads the manifest of a doc from its mirrored path, `.docctx/<doc path>.yaml` (DESIGN.md §7).
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @returns `undefined` when the doc has no manifest, so is not tracked.
 * @throws PathOutsideWorkspaceError when `docPath` is not confined to the workspace.
 * @throws ReservedDocPathError when `docPath` can't be tracked.
 * @throws ManifestError when the manifest is invalid, with every issue found.
 */
export async function readDocManifest(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string
): Promise<LoadedManifest | undefined> {

	const doc = await root.resolve( docPath );
	if( isReservedDocPath( doc.relative ) ) {
		throw new ReservedDocPathError( doc.relative );
	}
	const manifestPath = manifestPathFor( doc.relative );
	const confined = await root.resolve( manifestPath );
	let text: string;
	try {
		text = await readFile( confined.absolute, "utf8" );
	} catch( error ) {
		if( ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
			return undefined;
		}
		throw error;
	}
	return parseDocManifest( root, config, manifestPath, text );
}

/**
 * Parses and validates the text of a doc manifest (DESIGN.md §9) against the workspace config.
 *
 * @param file Workspace-relative path of the manifest, used in error messages.
 * @throws ManifestError when the text is invalid, with every issue found.
 */
export async function parseDocManifest(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	file: string,
	text: string
): Promise<LoadedManifest> {

	const yamlFile = YamlFile.parse( file, text );
	const reader = new NodeReader( yamlFile );
	const top = reader.root();
	if( top === undefined ) {
		reader.throwIfIssues();
		throw new Error( "unreachable: an unreadable manifest always has issues" );
	}

	top.checkKeys( TOP_LEVEL_KEYS );
	top.require( "doc", "type", "status" );

	const doc = await readDocPath( root, reader, top );
	const type = top.string( "type" );
	const status = top.string( "status" );
	checkTypeAndStatus( reader, config, type, status );

	const manifest: Partial<Writable<DocManifest>> = {};
	const audience = top.string( "audience" );
	if( audience !== undefined ) {
		manifest.audience = audience.value;
	}
	const owner = top.string( "owner" );
	if( owner !== undefined ) {
		manifest.owner = owner.value;
	}
	Object.assign( manifest, readScopeFields( reader, top ) );
	manifest.sections = readSections( reader, top );

	const verified = readVerification( reader, top );
	if( verified !== undefined ) {
		if( top.has( "sections" ) ) {
			reader.report(
				top.value( "verified" ),
				"top-level `verified` is only for docs without sections; it belongs in a section entry"
			);
		}
		manifest.verified = verified;
	}

	if( type !== undefined && type.value !== PLAN_TYPE ) {
		for( const key of PLAN_ONLY_KEYS ) {
			if( top.has( key ) ) {
				const message = `\`${key}\` is only allowed on plans (type \`${PLAN_TYPE}\`)`;
				reader.report( top.value( key ), message );
			}
		}
	}
	Object.assign( manifest, await readPlanFields( root, reader, top ) );

	const allowTerms = top.stringList( "allow_terms" );
	if( allowTerms !== undefined ) {
		manifest.allow_terms = allowTerms.map( ( term ) => term.value );
	}

	reader.throwIfIssues();
	if( doc === undefined || type === undefined || status === undefined ) {
		throw new Error( "unreachable: a manifest missing a required field always has issues" );
	}
	const result: DocManifest = {
		...manifest,
		"doc": doc,
		"type": type.value,
		"status": status.value,
		"sections": manifest.sections ?? new Map()
	};
	return { "manifest": result, "file": yamlFile };
}

async function readDocPath(
	root: WorkspaceRoot,
	reader: NodeReader,
	top: MapView
): Promise<string | undefined> {

	const value = top.string( "doc" );
	if( value === undefined ) {
		return undefined;
	}
	const doc = await confinePath( root, reader, "doc", value );
	if( doc !== undefined && isReservedDocPath( doc ) ) {
		const message = `\`doc\` is a reserved path and can't be tracked: ${JSON.stringify( doc )}`;
		reader.report( value.node, message );
		return undefined;
	}
	return doc;
}

function checkTypeAndStatus(
	reader: NodeReader,
	config: WorkspaceConfig,
	type: { readonly value: string; readonly node: Node } | undefined,
	status: { readonly value: string; readonly node: Node } | undefined
): void {

	if( type === undefined ) {
		return;
	}
	const docType = config.types.get( type.value );
	if( docType === undefined ) {
		const known = [ ...config.types.keys() ].join( ", " );
		reader.report( type.node, `unknown type \`${type.value}\`; the workspace defines: ${known}` );
		return;
	}
	if( status !== undefined && !docType.statuses.includes( status.value ) ) {
		reader.report(
			status.node,
			`\`${status.value}\` is not a status of type \`${type.value}\`; ` +
			`use one of: ${docType.statuses.join( ", " )}`
		);
	}
}

/** Reads `sources`, `context` and `exclude` from a manifest's top level or a section entry. */
function readScopeFields( reader: NodeReader, view: MapView ): SectionScope {

	const scope: Writable<SectionScope> = {};
	const sources = readGlobList( reader, view, "sources" );
	if( sources !== undefined ) {
		scope.sources = sources;
	}
	const context = readContext( reader, view );
	if( context !== undefined ) {
		scope.context = context;
	}
	const exclude = readGlobList( reader, view, "exclude" );
	if( exclude !== undefined ) {
		scope.exclude = exclude;
	}
	return scope;
}

function readGlobList( reader: NodeReader, view: MapView, key: string ): readonly string[] | undefined {

	const node = view.value( key );
	if( node === undefined ) {
		return undefined;
	}
	if( isMap( node ) ) {
		reader.report(
			node,
			`\`${view.field( key )}\` must be a list; only \`context\` accepts \`{ replace: [...] }\``
		);
		return undefined;
	}
	const patterns = reader.stringListAt( node, view.field( key ) );
	if( patterns === undefined ) {
		return undefined;
	}
	return checkGlobs( reader, view.field( key ), patterns );
}

function readContext( reader: NodeReader, view: MapView ): ContextList | undefined {

	const node = view.value( "context" );
	if( node === undefined ) {
		return undefined;
	}
	if( !isMap( node ) ) {
		return readGlobList( reader, view, "context" );
	}
	const replaceView = reader.mapAt( node, view.field( "context" ) );
	if( replaceView === undefined ) {
		return undefined;
	}
	replaceView.checkKeys( REPLACE_KEYS );
	replaceView.require( "replace" );
	const patterns = replaceView.stringList( "replace" );
	if( patterns === undefined ) {
		return undefined;
	}
	return { "replace": checkGlobs( reader, replaceView.field( "replace" ), patterns ) };
}

function readSections( reader: NodeReader, top: MapView ): ReadonlyMap<string, SectionScope> {

	const sections = new Map<string, SectionScope>();
	const view = top.map( "sections" );
	if( view === undefined ) {
		return sections;
	}
	for( const entry of view.entries() ) {
		const sectionView = reader.mapAt( entry.value, view.field( entry.key.value ) );
		if( sectionView === undefined ) {
			continue;
		}
		sectionView.checkKeys( SECTION_KEYS );
		const scope: Writable<SectionScope> = readScopeFields( reader, sectionView );
		const verified = readVerification( reader, sectionView );
		if( verified !== undefined ) {
			scope.verified = verified;
		}
		sections.set( entry.key.value, scope );
	}
	return sections;
}

function readVerification( reader: NodeReader, parent: MapView ): VerificationRecord | undefined {

	const view = parent.map( "verified" );
	if( view === undefined ) {
		return undefined;
	}
	view.checkKeys( VERIFIED_KEYS );
	view.require( "at", "by" );

	const at = view.string( "at" );
	if( at !== undefined && !isUtcTimestamp( at.value ) ) {
		reader.report(
			at.node,
			`\`${view.field( "at" )}\` must be a UTC timestamp such as 2026-09-25T14:02:00Z`
		);
	}
	const by = readChoice( reader, view, "by", VERIFIED_BY );
	const via = readChoice( reader, view, "via", VERIFIED_VIA );
	if( by === "human" && !view.has( "via" ) ) {
		reader.report(
			view.node,
			`missing \`${view.field( "via" )}\`, which is required when \`by\` is \`human\``
		);
	}
	if( by === "ai" && view.has( "via" ) ) {
		reader.report( view.value( "via" ), `\`${view.field( "via" )}\` is only for human decisions` );
	}
	const note = view.string( "note" );

	if( at === undefined || by === undefined ) {
		return undefined;
	}
	const record: Writable<VerificationRecord> = { "at": at.value, "by": by };
	if( via !== undefined && by === "human" ) {
		record.via = via;
	}
	if( note !== undefined ) {
		record.note = note.value;
	}
	return record;
}

function readChoice<T extends string>(
	reader: NodeReader,
	view: MapView,
	key: string,
	choices: readonly T[]
): T | undefined {

	const value = view.string( key );
	if( value === undefined ) {
		return undefined;
	}
	const choice = choices.find( ( candidate ) => candidate === value.value );
	if( choice === undefined ) {
		reader.report( value.node, `\`${view.field( key )}\` must be one of: ${choices.join( ", " )}` );
	}
	return choice;
}

async function readPlanFields(
	root: WorkspaceRoot,
	reader: NodeReader,
	top: MapView
): Promise<Partial<Writable<DocManifest>>> {

	const fields: Partial<Writable<DocManifest>> = {};
	const supersedes = top.string( "supersedes" );
	if( supersedes !== undefined ) {
		const confined = await confinePath( root, reader, "supersedes", supersedes );
		if( confined !== undefined ) {
			fields.supersedes = confined;
		}
	}

	const implementsInto = top.stringList( "implements_into" );
	if( implementsInto !== undefined ) {
		const docs: string[] = [];
		for( const item of implementsInto ) {
			const confined = await confinePath( root, reader, "implements_into[]", item );
			if( confined !== undefined ) {
				docs.push( confined );
			}
		}
		fields.implements_into = docs;
	}

	const decidedOn = top.string( "decided_on" );
	if( decidedOn !== undefined ) {
		if( isCalendarDate( decidedOn.value ) ) {
			fields.decided_on = decidedOn.value;
		} else {
			reader.report( decidedOn.node, "`decided_on` must be a date such as 2026-09-01" );
		}
	}
	return fields;
}

function isCalendarDate( value: string ): boolean {

	if( !DATE_PATTERN.test( value ) ) {
		return false;
	}

	// Rejects dates such as 2026-02-30, which Date would roll over into March
	const parsed = new Date( `${value}T00:00:00Z` );
	return !Number.isNaN( parsed.getTime() ) && parsed.toISOString().startsWith( value );
}

function isUtcTimestamp( value: string ): boolean {

	const match = UTC_TIMESTAMP_PATTERN.exec( value );
	if( match === null || match[ 1 ] === undefined || !isCalendarDate( match[ 1 ] ) ) {
		return false;
	}
	return Number( match[ 2 ] ) < 24 && Number( match[ 3 ] ) < 60 && Number( match[ 4 ] ) < 60;
}
