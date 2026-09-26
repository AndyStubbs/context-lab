import { getHashes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isScalar } from "yaml";
import { WORKSPACE_CONFIG_PATH } from "../manifest/manifest-paths.js";
import { checkGlobs, confinePath } from "../manifest/path-fields.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { MapView } from "../yaml/node-reader.js";
import { NodeReader } from "../yaml/node-reader.js";
import { YamlFile } from "../yaml/yaml-file.js";
import { DEFAULT_SETTINGS, DEFAULT_TYPES } from "./default-types.js";
import type {
	BannedTerm,
	DocType,
	Glossary,
	WorkspaceConfig,
	WorkspaceDefaults,
	WorkspaceSettings
} from "./workspace-config.js";

const TOP_LEVEL_KEYS = [ "version", "defaults", "types", "glossary", "settings" ];
const DEFAULTS_KEYS = [ "context", "exclude" ];
const TYPE_KEYS = [ "statuses", "exclude_from_context_when" ];
const GLOSSARY_KEYS = [ "file", "banned_terms" ];
const BANNED_TERM_KEYS = [ "term", "prefer" ];
const SETTINGS_KEYS = [ "hash_algorithm", "max_context_bytes", "max_diff_bytes" ];

/**
 * Reads `.docctx/workspace.yaml`. Any folder with `.docctx/` is a workspace (DESIGN.md §7), so
 * a missing file gives the default config.
 *
 * @throws ManifestError when the file is invalid, with every issue found.
 */
export async function readWorkspaceConfig( root: WorkspaceRoot ): Promise<WorkspaceConfig> {

	const confined = await root.resolve( WORKSPACE_CONFIG_PATH );
	let text: string;
	try {
		text = await readFile( confined.absolute, "utf8" );
	} catch( error ) {
		if( ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
			return defaultWorkspaceConfig();
		}
		throw error;
	}
	return parseWorkspaceConfig( root, WORKSPACE_CONFIG_PATH, text );
}

/** The config of a workspace without a `workspace.yaml`. */
export function defaultWorkspaceConfig(): WorkspaceConfig {

	return {
		"version": 1,
		"defaults": { "context": [], "exclude": [] },
		"types": DEFAULT_TYPES,
		"settings": DEFAULT_SETTINGS
	};
}

/**
 * Parses and validates the text of a `workspace.yaml` (DESIGN.md §8), filling in defaults.
 *
 * @param file Workspace-relative path, used in error messages.
 * @throws ManifestError when the text is invalid, with every issue found.
 */
export async function parseWorkspaceConfig(
	root: WorkspaceRoot,
	file: string,
	text: string
): Promise<WorkspaceConfig> {

	const reader = new NodeReader( YamlFile.parse( file, text ) );
	const top = reader.root();
	if( top === undefined ) {
		reader.throwIfIssues();
		throw new Error( "unreachable: an unreadable workspace config always has issues" );
	}

	top.checkKeys( TOP_LEVEL_KEYS );
	top.require( "version" );
	const versionNode = top.value( "version" );
	if( versionNode !== undefined && !( isScalar( versionNode ) && versionNode.value === 1 ) ) {
		reader.report( versionNode, "unsupported `version`; this version of ContextLabs reads version 1" );
	}

	const defaults = readDefaults( reader, top.map( "defaults" ) );
	const types = readTypes( reader, top );
	const glossary = await readGlossary( root, reader, top.map( "glossary" ) );
	const settings = readSettings( reader, top.map( "settings" ) );

	reader.throwIfIssues();
	const config: WorkspaceConfig = {
		"version": 1,
		"defaults": defaults,
		"types": types,
		"settings": settings
	};
	if( glossary !== undefined ) {
		return { ...config, "glossary": glossary };
	}
	return config;
}

function readDefaults( reader: NodeReader, view: MapView | undefined ): WorkspaceDefaults {

	if( view === undefined ) {
		return { "context": [], "exclude": [] };
	}
	view.checkKeys( DEFAULTS_KEYS );
	return {
		"context": checkGlobs( reader, view.field( "context" ), view.stringList( "context" ) ?? [] ),
		"exclude": checkGlobs( reader, view.field( "exclude" ), view.stringList( "exclude" ) ?? [] )
	};
}

function readTypes( reader: NodeReader, top: MapView ): ReadonlyMap<string, DocType> {

	// Absent means the defaults; anything else that isn't a mapping has been reported
	const view = top.map( "types" );
	if( view === undefined ) {
		return DEFAULT_TYPES;
	}

	const types = new Map<string, DocType>();
	const entries = view.entries();
	if( entries.length === 0 ) {
		reader.report( view.node, "`types` must define at least one type" );
	}
	for( const entry of entries ) {
		const typeView = reader.mapAt( entry.value, view.field( entry.key.value ) );
		if( typeView !== undefined ) {
			types.set( entry.key.value, readType( reader, typeView ) );
		}
	}
	return types;
}

function readType( reader: NodeReader, view: MapView ): DocType {

	view.checkKeys( TYPE_KEYS );
	view.require( "statuses" );

	const statuses: string[] = [];
	const statusItems = view.stringList( "statuses" );
	if( statusItems !== undefined && statusItems.length === 0 ) {
		const message = `\`${view.field( "statuses" )}\` must list at least one status`;
		reader.report( view.value( "statuses" ), message );
	}
	for( const status of statusItems ?? [] ) {
		if( statuses.includes( status.value ) ) {
			const message = `\`${view.field( "statuses" )}\` lists \`${status.value}\` twice`;
			reader.report( status.node, message );
		} else {
			statuses.push( status.value );
		}
	}

	const excludedWhen: string[] = [];
	for( const status of view.stringList( "exclude_from_context_when" ) ?? [] ) {
		if( statusItems !== undefined && !statuses.includes( status.value ) ) {
			reader.report(
				status.node,
				`\`${view.field( "exclude_from_context_when" )}\` has \`${status.value}\`, ` +
				"which is not one of the type's statuses"
			);
		} else {
			excludedWhen.push( status.value );
		}
	}
	return { "statuses": statuses, "exclude_from_context_when": excludedWhen };
}

async function readGlossary(
	root: WorkspaceRoot,
	reader: NodeReader,
	view: MapView | undefined
): Promise<Glossary | undefined> {

	if( view === undefined ) {
		return undefined;
	}
	view.checkKeys( GLOSSARY_KEYS );

	const bannedTerms: BannedTerm[] = [];
	for( const item of view.sequence( "banned_terms" ) ?? [] ) {
		const termView = reader.mapAt( item, `${view.field( "banned_terms" )}[]` );
		if( termView === undefined ) {
			continue;
		}
		termView.checkKeys( BANNED_TERM_KEYS );
		termView.require( "term", "prefer" );
		const term = termView.string( "term" );
		const prefer = termView.string( "prefer" );
		if( term !== undefined && term.value.trim().length === 0 ) {
			reader.report( term.node, `\`${termView.field( "term" )}\` must not be empty` );
		} else if( term !== undefined && prefer !== undefined ) {
			bannedTerms.push( { "term": term.value, "prefer": prefer.value } );
		}
	}

	const fileValue = view.string( "file" );
	if( fileValue === undefined ) {
		return { "banned_terms": bannedTerms };
	}
	const file = await confinePath( root, reader, view.field( "file" ), fileValue );
	if( file === undefined ) {
		return { "banned_terms": bannedTerms };
	}
	return { "file": file, "banned_terms": bannedTerms };
}

function readSettings( reader: NodeReader, view: MapView | undefined ): WorkspaceSettings {

	if( view === undefined ) {
		return DEFAULT_SETTINGS;
	}
	view.checkKeys( SETTINGS_KEYS );

	let hashAlgorithm = DEFAULT_SETTINGS.hash_algorithm;
	const algorithm = view.string( "hash_algorithm" );
	if( algorithm !== undefined ) {
		if( getHashes().includes( algorithm.value ) ) {
			hashAlgorithm = algorithm.value;
		} else {
			reader.report(
				algorithm.node,
				`\`${view.field( "hash_algorithm" )}\` is not a hash algorithm Node.js supports: ` +
				JSON.stringify( algorithm.value )
			);
		}
	}
	const maxContextBytes = view.positiveInteger( "max_context_bytes" );
	const maxDiffBytes = view.positiveInteger( "max_diff_bytes" );
	return {
		"hash_algorithm": hashAlgorithm,
		"max_context_bytes": maxContextBytes?.value ?? DEFAULT_SETTINGS.max_context_bytes,
		"max_diff_bytes": maxDiffBytes?.value ?? DEFAULT_SETTINGS.max_diff_bytes
	};
}
