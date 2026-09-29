import type { DocManifest } from "../manifest/doc-manifest.js";
import type { ManifestProblem } from "../manifest/list-manifests.js";
import { listManifests } from "../manifest/list-manifests.js";
import { readTextIfExists } from "../fs/read-text-if-exists.js";
import { comparePaths } from "../paths/compare-paths.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import { buildOutline } from "../sections/build-outline.js";
import { findOrphanedSections } from "../sections/orphaned-sections.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";

/**
 * Every tracked doc and what needs attention across the workspace. Section states and stale
 * counts come in Phase 4.
 */
export interface WorkspaceStatus {

	/** Valid manifests, sorted by doc path. */
	readonly docs: readonly DocManifest[];

	/** Manifests that couldn't be used, sorted by manifest path. */
	readonly problems: readonly ManifestProblem[];

	/** Doc path to its orphaned section keys, for docs that have any, sorted by doc path. */
	readonly orphanedSections: ReadonlyMap<string, readonly string[]>;

	/** Tracked docs whose file no longer exists, sorted (DESIGN.md §16). */
	readonly missingDocs: readonly string[];
}

/**
 * Reads the status of every tracked doc. This is the entry point for `get_status` without a
 * doc. One broken manifest or missing doc never hides the others.
 */
export async function loadWorkspaceStatus(
	root: WorkspaceRoot,
	config: WorkspaceConfig
): Promise<WorkspaceStatus> {

	const index = await listManifests( root, config );
	const docs = [ ...index.manifests.values() ].sort( ( a, b ) => comparePaths( a.doc, b.doc ) );
	const orphanedSections = new Map<string, readonly string[]>();
	const missingDocs: string[] = [];
	for( const manifest of docs ) {
		const doc = await root.resolve( manifest.doc );
		const text = await readTextIfExists( doc.absolute );
		if( text === undefined ) {
			missingDocs.push( manifest.doc );
			continue;
		}
		const orphaned = findOrphanedSections( manifest, buildOutline( doc.relative, text ) );
		if( orphaned.length > 0 ) {
			orphanedSections.set( manifest.doc, orphaned );
		}
	}
	return {
		"docs": docs,
		"problems": index.problems,
		"orphanedSections": orphanedSections,
		"missingDocs": missingDocs
	};
}
