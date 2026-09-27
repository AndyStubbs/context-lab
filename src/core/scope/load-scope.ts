import { listManifests } from "../manifest/list-manifests.js";
import { readDocManifest } from "../manifest/read-doc-manifest.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import { readOutline } from "../sections/read-outline.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { ResolvedScope } from "./resolved-scope.js";
import { resolveScope } from "./resolve-scope.js";
import { UnknownSectionError } from "./unknown-section-error.js";
import { UntrackedDocError } from "./untracked-doc-error.js";

/**
 * Resolves the scope of a tracked doc or one of its sections, reading everything it needs
 * from the workspace. This is the entry point for `docctx scope` and `get_scope`.
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @param section Section key; it must be a heading in the doc. Omit for the whole doc.
 * @throws UntrackedDocError when the doc has no manifest.
 * @throws UnknownSectionError when the section isn't a heading in the doc.
 * @throws ManifestError when the doc's own manifest is invalid. Other invalid manifests only
 *     produce warnings.
 */
export async function loadScope(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string,
	section?: string
): Promise<ResolvedScope> {

	const doc = await root.resolve( docPath );
	const loaded = await readDocManifest( root, config, doc.relative );
	if( loaded === undefined ) {
		throw new UntrackedDocError( doc.relative );
	}

	if( section !== undefined ) {
		const outline = await readOutline( root, loaded.manifest.doc );
		if( outline.kind === "single" ) {
			throw new UnknownSectionError( outline.doc, section, "no-sections" );
		}
		if( !outline.sections.some( ( entry ) => entry.key === section ) ) {
			throw new UnknownSectionError( outline.doc, section, "not-a-heading" );
		}
	}

	const index = await listManifests( root, config );
	return resolveScope( root, config, loaded.manifest, index, section );
}
