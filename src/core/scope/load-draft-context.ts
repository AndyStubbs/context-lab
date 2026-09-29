import { listManifests } from "../manifest/list-manifests.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { SectionText } from "../sections/load-section.js";
import { loadSection } from "../sections/load-section.js";
import type { BannedTerm, WorkspaceConfig } from "../workspace/workspace-config.js";
import type { ScopeFile } from "./read-scope-files.js";
import { readScopeFiles } from "./read-scope-files.js";
import type { ResolvedScope } from "./resolved-scope.js";
import { resolveScope } from "./resolve-scope.js";

/**
 * Everything a draft or revision of one section is written from (DESIGN.md §14.3; ROADMAP.md
 * Phase 3, PR 4).
 */
export interface DraftContext {

	/** The section's current text, with the doc's outline and manifest. */
	readonly section: SectionText;
	readonly scope: ResolvedScope;

	/**
	 * Every file in scope, sources first. Absent when the scope is over `max_context_bytes`:
	 * files are never partly included (§14.1).
	 */
	readonly files?: readonly ScopeFile[];

	/** The workspace's banned terms, less those the doc's manifest allows. */
	readonly bannedTerms: readonly BannedTerm[];
}

/**
 * Loads the section, its resolved scope and the scope's files, for the `draft-section` and
 * `revise-section` prompts.
 *
 * @param docPath Workspace-relative; confined with `WorkspaceRoot.resolve`.
 * @param section Section key. Omit for the whole doc.
 * @throws UntrackedDocError when the doc has no manifest.
 * @throws UnknownSectionError when the section isn't a heading in the doc.
 * @throws ManifestError when the doc's manifest is invalid.
 */
export async function loadDraftContext(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	docPath: string,
	section?: string
): Promise<DraftContext> {

	const loaded = await loadSection( root, config, docPath, section );
	const index = await listManifests( root, config );
	const scope = await resolveScope( root, config, loaded.manifest, index, section );
	const allowed = new Set( ( loaded.manifest.allow_terms ?? [] ).map( ( term ) => term.toLowerCase() ) );
	const bannedTerms = ( config.glossary?.banned_terms ?? [] )
		.filter( ( banned ) => !allowed.has( banned.term.toLowerCase() ) );

	const context = { "section": loaded, "scope": scope, "bannedTerms": bannedTerms };
	if( scope.warnings.some( ( warning ) => warning.kind === "over-budget" ) ) {
		return context;
	}
	return { ...context, "files": await readScopeFiles( root, scope ) };
}
