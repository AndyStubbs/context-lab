/** The metadata folder at the workspace root (DESIGN.md §7). */
export const DOCCTX_DIR = ".docctx";

/** Workspace-relative path of the workspace config. */
export const WORKSPACE_CONFIG_PATH = `${DOCCTX_DIR}/workspace.yaml`;

/**
 * Workspace-relative path of a doc's manifest: the doc's path mirrored under `.docctx/`, with
 * its extension kept and `.yaml` added (DESIGN.md §7).
 *
 * @param docPath Normalized workspace-relative doc path, as `WorkspaceRoot.resolve` returns.
 */
export function manifestPathFor( docPath: string ): string {
	return `${DOCCTX_DIR}/${docPath}.yaml`;
}

/**
 * The doc a manifest path mirrors: the inverse of `manifestPathFor`. The manifest's own `doc`
 * field is authoritative (DESIGN.md §9); this is for manifests too broken to read it from.
 *
 * @returns `undefined` for paths that aren't manifest paths.
 */
export function docPathForManifest( manifestPath: string ): string | undefined {

	const prefix = `${DOCCTX_DIR}/`;
	if( !manifestPath.startsWith( prefix ) || !manifestPath.endsWith( ".yaml" ) ) {
		return undefined;
	}
	const doc = manifestPath.slice( prefix.length, -".yaml".length );
	if( doc.length === 0 ) {
		return undefined;
	}
	return doc;
}

/**
 * Workspace-relative path of a doc's lock file, beside its manifest (DESIGN.md §13).
 *
 * @param docPath Normalized workspace-relative doc path, as `WorkspaceRoot.resolve` returns.
 */
export function lockPathFor( docPath: string ): string {
	return `${DOCCTX_DIR}/${docPath}.lock`;
}

/**
 * True for doc paths that can't be tracked because their metadata would collide with
 * ContextLabs' own files: a root-level `workspace` (DESIGN.md §7), anything under a root-level
 * `.history/` (§7), and anything under `.docctx/` itself.
 *
 * @param docPath Normalized workspace-relative doc path, as `WorkspaceRoot.resolve` returns.
 */
export function isReservedDocPath( docPath: string ): boolean {

	if( docPath === "." || docPath === "workspace" ) {
		return true;
	}
	const top = docPath.split( "/" )[ 0 ];
	return top === ".history" || top === DOCCTX_DIR;
}
