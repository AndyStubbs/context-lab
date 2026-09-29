import type { DocManifest } from "../manifest/doc-manifest.js";
import { readDocManifest } from "../manifest/read-doc-manifest.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { DocOutline } from "../sections/doc-outline.js";
import { findOrphanedSections } from "../sections/orphaned-sections.js";
import { readOutline } from "../sections/read-outline.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";

/**
 * A doc's outline and, when it is tracked, its manifest. Section states come in Phase 4.
 */
export interface DocStatus {
	readonly outline: DocOutline;

	/** Absent when the doc isn't tracked, so a scope can still be proposed from its outline. */
	readonly manifest?: DocManifest;

	/** Manifest section keys that match no heading, in manifest order (DESIGN.md §10). */
	readonly orphanedSections: readonly string[];
}

/**
 * Reads the status of one doc, tracked or not. This is the entry point for `get_status` with
 * a doc.
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @throws ReservedDocPathError when `docPath` is under `.docctx/`.
 * @throws ManifestError when the doc's manifest is invalid.
 */
export async function loadDocStatus(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string
): Promise<DocStatus> {

	const loaded = await readDocManifest( root, config, docPath );
	const outline = await readOutline( root, docPath );
	if( loaded === undefined ) {
		return { "outline": outline, "orphanedSections": [] };
	}
	return {
		"outline": outline,
		"manifest": loaded.manifest,
		"orphanedSections": findOrphanedSections( loaded.manifest, outline )
	};
}
