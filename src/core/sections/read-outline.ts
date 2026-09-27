import { readFile } from "node:fs/promises";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import { buildOutline } from "./build-outline.js";
import type { DocOutline } from "./doc-outline.js";

/**
 * Reads a doc and builds its section outline (DESIGN.md §10).
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @throws PathOutsideWorkspaceError when `docPath` is not confined to the workspace.
 */
export async function readOutline( root: WorkspaceRoot, docPath: string ): Promise<DocOutline> {

	const doc = await root.resolve( docPath );
	const text = await readFile( doc.absolute, "utf8" );
	return buildOutline( doc.relative, text );
}
