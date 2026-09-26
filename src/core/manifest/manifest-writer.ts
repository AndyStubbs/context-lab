import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "../fs/write-file-atomic.js";
import { checkGlobPattern } from "../paths/glob-pattern.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { DocManifest } from "./doc-manifest.js";
import { isReplaceContext } from "./doc-manifest.js";
import type { NewManifestFields } from "./manifest-editor.js";
import { ManifestEditor } from "./manifest-editor.js";
import { manifestPathFor } from "./manifest-paths.js";
import { ManifestWriteError } from "./manifest-write-error.js";
import { parseDocManifest, readDocManifest } from "./read-doc-manifest.js";
import type { ScopeChange } from "./scope-change.js";

/**
 * A manifest change that has been computed and validated but not written yet, so the result
 * can be shown to the user for approval first (DESIGN.md §5, §14.2).
 */
export interface ManifestUpdate {

	/** Workspace-relative path of the manifest. */
	readonly path: string;

	/** The manifest as it will be once written. */
	readonly manifest: DocManifest;

	/** The new file text. */
	readonly text: string;

	/** The file text the update was computed from; `undefined` when creating the manifest. */
	readonly previousText: string | undefined;

	/** False when the change leaves the manifest as it is; writing it then does nothing. */
	readonly changed: boolean;
}

/**
 * Computes the manifest that results from a scope change, creating the manifest when the doc
 * has none and `create` is given. Nothing is written.
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @param create Type and status for a new manifest; ignored when the doc already has one.
 * @throws PathOutsideWorkspaceError when `docPath` or a glob pattern in `change` is not
 *     confined to the workspace.
 * @throws ReservedDocPathError when `docPath` can't be tracked.
 * @throws ManifestWriteError (`untracked`) when the doc has no manifest and `create` is absent.
 * @throws ManifestError when the existing manifest is invalid, or the result would be (for
 *     example, an unknown type in `create`).
 */
export async function prepareScopeChange(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string,
	change: ScopeChange,
	create?: NewManifestFields
): Promise<ManifestUpdate> {

	checkChange( change );
	const doc = await root.resolve( docPath );
	const manifestPath = manifestPathFor( doc.relative );
	const loaded = await readDocManifest( root, config, doc.relative );

	let editor: ManifestEditor;
	if( loaded !== undefined ) {
		editor = ManifestEditor.edit( loaded.file );
	} else if( create !== undefined ) {
		editor = ManifestEditor.create( doc.relative, create );
	} else {
		throw new ManifestWriteError( manifestPath, "untracked" );
	}

	const changed = editor.applyScopeChange( change ) || loaded === undefined;
	if( !changed && loaded !== undefined ) {

		// Leave the text alone rather than re-serializing an unchanged document
		return {
			"path": manifestPath,
			"manifest": loaded.manifest,
			"text": loaded.file.text,
			"previousText": loaded.file.text,
			"changed": false
		};
	}

	// `yaml` writes LF; keep a checked-out CRLF manifest in CRLF so only changed lines differ
	let text = editor.toString();
	if( loaded?.file.text.includes( "\r\n" ) === true ) {
		text = text.replaceAll( "\n", "\r\n" );
	}
	const parsed = await parseDocManifest( root, config, manifestPath, text );
	return {
		"path": manifestPath,
		"manifest": parsed.manifest,
		"text": text,
		"previousText": loaded?.file.text,
		"changed": true
	};
}

/**
 * Writes a prepared update, creating the manifest's folders if needed. The write is atomic.
 *
 * @throws ManifestWriteError (`changed-on-disk`) when the manifest no longer matches the text
 *     the update was prepared from, for example after an edit while the user was deciding.
 */
export async function writeManifestUpdate( root: WorkspaceRoot, update: ManifestUpdate ): Promise<void> {

	if( !update.changed ) {
		return;
	}
	const confined = await root.resolve( update.path );
	const current = await readTextIfExists( confined.absolute );
	if( current !== update.previousText ) {
		throw new ManifestWriteError( update.path, "changed-on-disk" );
	}
	await mkdir( path.dirname( confined.absolute ), { "recursive": true } );
	await writeFileAtomic( confined.absolute, update.text );
}

/**
 * Rejects bad patterns before editing, so errors name the pattern rather than a line in text
 * the user never saw. The edited manifest is validated again as a whole afterwards.
 */
function checkChange( change: ScopeChange ): void {

	if( change.section !== undefined && change.section.length === 0 ) {
		throw new Error( "Section slug must not be empty" );
	}
	const patterns: string[] = [ ...change.sources ?? [], ...change.exclude ?? [] ];
	const context = change.context;
	if( context !== undefined && context !== null ) {
		if( isReplaceContext( context ) ) {
			patterns.push( ...context.replace );
		} else {
			patterns.push( ...context );
		}
	}
	for( const pattern of patterns ) {
		checkGlobPattern( pattern );
	}
}

async function readTextIfExists( target: string ): Promise<string | undefined> {

	try {
		return await readFile( target, "utf8" );
	} catch( error ) {
		if( ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
			return undefined;
		}
		throw error;
	}
}
