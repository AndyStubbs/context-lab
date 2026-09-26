import type { Node, Pair } from "yaml";
import { isMap, isScalar, isSeq, YAMLMap } from "yaml";
import type { ManifestIssue } from "./manifest-error.js";
import { ManifestError } from "./manifest-error.js";
import type { YamlFile } from "./yaml-file.js";

/**
 * A value read from YAML, with the node it came from so later checks can point at it.
 */
export interface Located<T> {
	readonly value: T;
	readonly node: Node;
}

/**
 * Reads and validates the nodes of one YAML file, collecting every issue instead of stopping
 * at the first. Field names in messages are dotted paths from the top of the file
 * (`sections.token-refresh.sources`).
 */
export class NodeReader {

	private readonly m_file: YamlFile;
	private readonly m_issues: ManifestIssue[] = [];

	constructor( file: YamlFile ) {
		this.m_file = file;
	}

	/** Records an issue at `node`, or at the start of the file when there is no node. */
	report( node: Node | null | undefined, message: string ): void {
		this.m_issues.push( this.m_file.issueAt( node, message ) );
	}

	get hasIssues(): boolean {
		return this.m_issues.length > 0;
	}

	/**
	 * @throws ManifestError with every issue reported so far, if there are any.
	 */
	throwIfIssues(): void {

		if( this.m_issues.length > 0 ) {
			throw new ManifestError( this.m_file.file, this.m_issues );
		}
	}

	/**
	 * The file's top-level mapping. Reports an empty file or a top level that isn't a mapping.
	 */
	root(): MapView | undefined {

		const contents = this.m_file.document.contents;
		if( contents === null || ( isScalar( contents ) && contents.value === null ) ) {
			this.report( undefined, "file is empty" );
			return undefined;
		}
		if( !isMap( contents ) ) {
			this.report( contents, "top level must be a mapping" );
			return undefined;
		}
		return new MapView( this, contents, "" );
	}

	/** Reports `field` unless `node` is a mapping. */
	mapAt( node: Node | null, field: string ): MapView | undefined {

		if( node instanceof YAMLMap ) {
			return new MapView( this, node, field );
		}
		this.report( node, `\`${field}\` must be a mapping` );
		return undefined;
	}

	/** Reports `field` unless `node` is a string scalar. */
	stringAt( node: Node | null, field: string ): Located<string> | undefined {

		if( isScalar( node ) && typeof node.value === "string" ) {
			return { "value": node.value, "node": node };
		}
		this.report( node, `\`${field}\` must be a string` );
		return undefined;
	}

	/**
	 * Reports `field` unless `node` is a list of strings. Items that aren't strings are
	 * reported and left out of the result.
	 */
	stringListAt( node: Node | null, field: string ): readonly Located<string>[] | undefined {

		const items = this.sequenceAt( node, field );
		if( items === undefined ) {
			return undefined;
		}
		const values: Located<string>[] = [];
		for( const item of items ) {
			const value = this.stringAt( item, `${field}[]` );
			if( value !== undefined ) {
				values.push( value );
			}
		}
		return values;
	}

	/** Reports `field` unless `node` is a list; returns its items. */
	sequenceAt( node: Node | null, field: string ): readonly ( Node | null )[] | undefined {

		if( !isSeq( node ) ) {
			this.report( node, `\`${field}\` must be a list` );
			return undefined;
		}
		return node.items.map( asNode );
	}

	/** Reports `field` unless `node` is an integer of at least 1. */
	positiveIntegerAt( node: Node | null, field: string ): Located<number> | undefined {

		if( isScalar( node ) && typeof node.value === "number" && Number.isSafeInteger( node.value ) ) {
			if( node.value >= 1 ) {
				return { "value": node.value, "node": node };
			}
		}
		this.report( node, `\`${field}\` must be a positive integer` );
		return undefined;
	}
}

/**
 * A YAML mapping being read, and its dotted path from the top of the file.
 */
export class MapView {

	private readonly m_reader: NodeReader;
	private readonly m_map: YAMLMap;
	private readonly m_path: string;

	constructor( reader: NodeReader, map: YAMLMap, path: string ) {

		this.m_reader = reader;
		this.m_map = map;
		this.m_path = path;
	}

	get node(): YAMLMap {
		return this.m_map;
	}

	/** Dotted path of this mapping; empty for the top level. */
	get path(): string {
		return this.m_path;
	}

	/** Dotted path of one of this mapping's keys. */
	field( key: string ): string {

		if( this.m_path === "" ) {
			return key;
		}
		return `${this.m_path}.${key}`;
	}

	/**
	 * The mapping's entries in source order. Keys that aren't strings are reported and
	 * skipped.
	 */
	entries(): readonly { readonly key: Located<string>; readonly value: Node | null }[] {

		const entries: { key: Located<string>; value: Node | null }[] = [];
		for( const pair of this.m_map.items ) {
			const key = asNode( pair.key );
			if( isScalar( key ) && typeof key.value === "string" ) {
				const located = { "value": key.value, "node": key };
				entries.push( { "key": located, "value": this.valueOf( pair ) } );
			} else {
				this.m_reader.report( key, `keys in \`${this.describe()}\` must be strings` );
			}
		}
		return entries;
	}

	/** Reports every key not in `allowed`. */
	checkKeys( allowed: readonly string[] ): void {

		for( const entry of this.entries() ) {
			if( !allowed.includes( entry.key.value ) ) {
				const message = `unknown field \`${this.field( entry.key.value )}\``;
				this.m_reader.report( entry.key.node, message );
			}
		}
	}

	has( key: string ): boolean {
		return this.findPair( key ) !== undefined;
	}

	/**
	 * The value node for `key`: `undefined` when the key is absent, `null` when it has no
	 * value.
	 */
	value( key: string ): Node | null | undefined {

		const pair = this.findPair( key );
		if( pair === undefined ) {
			return undefined;
		}
		return this.valueOf( pair );
	}

	/** Reports each of `keys` that is absent, at the start of this mapping. */
	require( ...keys: readonly string[] ): void {

		for( const key of keys ) {
			if( !this.has( key ) ) {
				this.m_reader.report( this.m_map, `missing required field \`${this.field( key )}\`` );
			}
		}
	}

	/** `undefined` when absent; reported and `undefined` when present but not a string. */
	string( key: string ): Located<string> | undefined {

		const node = this.value( key );
		if( node === undefined ) {
			return undefined;
		}
		return this.m_reader.stringAt( node, this.field( key ) );
	}

	stringList( key: string ): readonly Located<string>[] | undefined {

		const node = this.value( key );
		if( node === undefined ) {
			return undefined;
		}
		return this.m_reader.stringListAt( node, this.field( key ) );
	}

	sequence( key: string ): readonly ( Node | null )[] | undefined {

		const node = this.value( key );
		if( node === undefined ) {
			return undefined;
		}
		return this.m_reader.sequenceAt( node, this.field( key ) );
	}

	positiveInteger( key: string ): Located<number> | undefined {

		const node = this.value( key );
		if( node === undefined ) {
			return undefined;
		}
		return this.m_reader.positiveIntegerAt( node, this.field( key ) );
	}

	map( key: string ): MapView | undefined {

		const node = this.value( key );
		if( node === undefined ) {
			return undefined;
		}
		return this.m_reader.mapAt( node, this.field( key ) );
	}

	private findPair( key: string ): Pair | undefined {

		for( const pair of this.m_map.items ) {
			const keyNode = asNode( pair.key );
			if( isScalar( keyNode ) && keyNode.value === key ) {
				return pair;
			}
		}
		return undefined;
	}

	/**
	 * The pair's value node. An empty value (`sources:`) is a null scalar positioned just after
	 * the colon, so reports about it point there.
	 */
	private valueOf( pair: Pair ): Node | null {
		return asNode( pair.value );
	}

	private describe(): string {

		if( this.m_path === "" ) {
			return "top level";
		}
		return this.m_path;
	}
}

/** Narrows a parsed pair's key, value or item, which is always a node or null when parsed. */
function asNode( value: unknown ): Node | null {

	if( value === null || value === undefined ) {
		return null;
	}
	return value as Node;
}
