import { readFile } from "node:fs/promises";
import fg from "fast-glob";
import { comparePaths } from "../paths/compare-paths.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { DocManifest } from "./doc-manifest.js";
import { docPathForManifest, DOCCTX_DIR, WORKSPACE_CONFIG_PATH } from "./manifest-paths.js";
import { parseDocManifest } from "./read-doc-manifest.js";

/**
 * A manifest that couldn't be used, and the doc it would describe.
 */
export interface ManifestProblem {

	/** Workspace-relative path of the manifest. */
	readonly path: string;

	/** The doc it claims, or the doc its path mirrors when it can't be read. */
	readonly doc: string;
	readonly message: string;
}

/**
 * Every manifest in the workspace, keyed by the doc it describes.
 */
export interface ManifestIndex {
	readonly manifests: ReadonlyMap<string, DocManifest>;

	/** Invalid manifests, and every manifest claiming a doc that another manifest also claims. */
	readonly problems: readonly ManifestProblem[];
}

/**
 * Finds and parses every manifest under `.docctx/`, skipping `workspace.yaml` and `.history/`.
 * Problems are collected rather than thrown, so one broken manifest doesn't hide the rest.
 */
export async function listManifests( root: WorkspaceRoot, config: WorkspaceConfig ): Promise<ManifestIndex> {

	const paths = await fg( `${DOCCTX_DIR}/**/*.yaml`, {
		"cwd": root.absolute,
		"dot": true,
		"onlyFiles": true,
		"followSymbolicLinks": false,
		"ignore": [ WORKSPACE_CONFIG_PATH, `${DOCCTX_DIR}/.history/**` ]
	} );
	paths.sort( comparePaths );

	const claims = new Map<string, { path: string; manifest: DocManifest }[]>();
	const problems: ManifestProblem[] = [];
	for( const manifestPath of paths ) {
		try {
			const confined = await root.resolve( manifestPath );
			const text = await readFile( confined.absolute, "utf8" );
			const loaded = await parseDocManifest( root, config, manifestPath, text );
			const doc = loaded.manifest.doc;
			claims.set( doc, [ ...claims.get( doc ) ?? [], { "path": manifestPath, "manifest": loaded.manifest } ] );
		} catch( error ) {
			if( !( error instanceof Error ) ) {
				throw error;
			}
			problems.push( {
				"path": manifestPath,
				"doc": docPathForManifest( manifestPath ) ?? manifestPath,
				"message": error.message
			} );
		}
	}

	const manifests = new Map<string, DocManifest>();
	for( const [ doc, entries ] of claims ) {
		const [ only ] = entries;
		if( entries.length === 1 && only !== undefined ) {
			manifests.set( doc, only.manifest );
			continue;
		}
		const others = entries.map( ( entry ) => entry.path ).join( ", " );
		for( const entry of entries ) {
			problems.push( {
				"path": entry.path,
				"doc": doc,
				"message": `${JSON.stringify( doc )} is claimed by more than one manifest: ${others}`
			} );
		}
	}
	problems.sort( ( a, b ) => comparePaths( a.path, b.path ) );
	return { "manifests": manifests, "problems": problems };
}
