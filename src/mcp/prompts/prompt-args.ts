import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { listManifests } from "../../core/manifest/list-manifests.js";
import { comparePaths } from "../../core/paths/compare-paths.js";
import { readOutline } from "../../core/sections/read-outline.js";
import { locateWorkspace } from "../../core/workspace/locate-workspace.js";
import { readWorkspaceConfig } from "../../core/workspace/read-workspace-config.js";

/** The most values a completion result may carry (MCP `completion/complete`). */
const MAX_COMPLETIONS = 100;

/**
 * The `doc` prompt argument, completing tracked docs whose path contains what was typed
 * (ROADMAP.md Phase 3, PR 4 decision 5).
 */
export function docArgument( startDir: string ): z.ZodString {

	const schema = z.string().min( 1 ).describe( "Doc path, relative to the workspace root" );
	return completable( schema, async ( value ) => completeDocs( startDir, value ) );
}

/** The `section` prompt argument, completing the chosen doc's section keys. */
export function sectionArgument( startDir: string ): z.ZodOptional<z.ZodString> {

	const schema = z.string().min( 1 ).optional().describe( "Section key; omit only for a doc without sections" );
	return completable( schema, async ( value, context ) => {
		return completeSections( startDir, context?.arguments?.[ "doc" ], value );
	} );
}

/**
 * Completion never fails: while a doc is still being typed, or a manifest is invalid, it has
 * nothing to offer, which is an empty list rather than an error.
 */
async function completeDocs( startDir: string, value: string ): Promise<string[]> {

	const lookup = async (): Promise<string[]> => {
		const root = await locateWorkspace( startDir );
		const index = await listManifests( root, await readWorkspaceConfig( root ) );
		return matching( [ ...index.manifests.keys() ].sort( comparePaths ), value );
	};
	return lookup().catch( () => [] );
}

async function completeSections(
	startDir: string,
	doc: string | undefined,
	value: string | undefined
): Promise<string[]> {

	if( doc === undefined || doc.length === 0 ) {
		return [];
	}
	const lookup = async (): Promise<string[]> => {
		const outline = await readOutline( await locateWorkspace( startDir ), doc );
		return matching( outline.sections.map( ( section ) => section.key ), value ?? "" );
	};
	return lookup().catch( () => [] );
}

/** Case-insensitive substring match, in the given order, capped at the protocol's limit. */
function matching( candidates: readonly string[], value: string ): string[] {

	const typed = value.toLowerCase();
	return candidates.filter( ( candidate ) => candidate.toLowerCase().includes( typed ) ).slice( 0, MAX_COMPLETIONS );
}
