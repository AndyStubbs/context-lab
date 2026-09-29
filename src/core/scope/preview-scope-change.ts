import type { DocManifest } from "../manifest/doc-manifest.js";
import { listManifests } from "../manifest/list-manifests.js";
import type { NewManifestFields } from "../manifest/manifest-editor.js";
import type { ManifestUpdate } from "../manifest/manifest-writer.js";
import { prepareScopeChange } from "../manifest/manifest-writer.js";
import { readDocManifest } from "../manifest/read-doc-manifest.js";
import type { ScopeChange } from "../manifest/scope-change.js";
import { TrackedFieldsError } from "../manifest/tracked-fields-error.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import { readOutline } from "../sections/read-outline.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { ResolvedScope } from "./resolved-scope.js";
import { resolveScope } from "./resolve-scope.js";
import { UnknownSectionError } from "./unknown-section-error.js";

/**
 * A validated scope change, not yet written, and the scope it produces: what the user
 * approves (DESIGN.md §14.2).
 */
export interface ScopePreview {

	/** Write it with `writeManifestUpdate` once the user accepts. */
	readonly update: ManifestUpdate;

	/** The doc or section scope as it will resolve once the update is written. */
	readonly scope: ResolvedScope;

	/** The manifest before the change; absent when the change creates it. */
	readonly previous?: DocManifest;
}

/**
 * Validates a scope change and resolves the scope it would produce, writing nothing. This is
 * the entry point for `set_scope`.
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`. The doc must exist.
 * @param create Type and status for a new manifest. For a tracked doc they must match its
 *     manifest.
 * @throws UnknownSectionError when `change.section` isn't a heading in the doc, so a change
 *     never creates an orphaned key.
 * @throws TrackedFieldsError when `create` differs from the tracked doc's manifest.
 * @throws ManifestWriteError (`untracked`) when the doc has no manifest and `create` is absent.
 * @throws ManifestError when the manifest is invalid now, or would be after the change.
 * @throws PathOutsideWorkspaceError when the doc or a pattern isn't confined to the workspace.
 */
export async function previewScopeChange(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string,
	change: ScopeChange,
	create?: NewManifestFields
): Promise<ScopePreview> {

	// Reading the outline first also rejects a doc that doesn't exist
	const outline = await readOutline( root, docPath );
	if( change.section !== undefined ) {
		if( outline.kind === "single" ) {
			throw new UnknownSectionError( outline.doc, change.section, "no-sections" );
		}
		if( !outline.sections.some( ( section ) => section.key === change.section ) ) {
			throw new UnknownSectionError( outline.doc, change.section, "not-a-heading" );
		}
	}

	const loaded = await readDocManifest( root, config, outline.doc );
	if( loaded !== undefined && create !== undefined ) {
		checkTrackedFields( loaded.manifest, create );
	}
	const update = await prepareScopeChange( root, config, outline.doc, change, create );
	const index = await listManifests( root, config );
	const scope = await resolveScope( root, config, update.manifest, index, change.section );
	if( loaded === undefined ) {
		return { "update": update, "scope": scope };
	}
	return { "update": update, "scope": scope, "previous": loaded.manifest };
}

function checkTrackedFields( manifest: DocManifest, create: NewManifestFields ): void {

	const differences: string[] = [];
	if( create.type !== manifest.type ) {
		differences.push( `type is ${manifest.type}, not ${create.type}` );
	}
	if( create.status !== manifest.status ) {
		differences.push( `status is ${manifest.status}, not ${create.status}` );
	}
	if( create.audience !== undefined && create.audience !== manifest.audience ) {
		const current = JSON.stringify( manifest.audience ?? "" );
		differences.push( `audience is ${current}, not ${JSON.stringify( create.audience )}` );
	}
	if( differences.length > 0 ) {
		throw new TrackedFieldsError( manifest.doc, differences );
	}
}
