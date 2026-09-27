import { stat } from "node:fs/promises";
import fg from "fast-glob";
import picomatch from "picomatch";
import type { DocManifest } from "../manifest/doc-manifest.js";
import type { ManifestIndex } from "../manifest/list-manifests.js";
import { DOCCTX_DIR } from "../manifest/manifest-paths.js";
import { comparePaths } from "../paths/compare-paths.js";
import { PathOutsideWorkspaceError } from "../paths/path-outside-workspace-error.js";
import type { ConfinedPath, WorkspaceRoot } from "../paths/workspace-root.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import { mergeScopeRules } from "./merge-scope.js";
import type {
	ExcludedEntry,
	ExclusionReason,
	ResolvedScope,
	ScopeEntry,
	ScopeReason,
	ScopeRole,
	ScopeWarning
} from "./resolved-scope.js";

interface Candidate {
	readonly role: ScopeRole;
	readonly reasons: ScopeReason[];
	readonly confined: ConfinedPath;
}

/** An excluded entry while it is being built; reasons can still grow. */
interface PendingExclusion extends ExcludedEntry {
	readonly reasons: ScopeReason[];
}

// Never in scope, whatever the patterns say
const ALWAYS_IGNORED = [ ".git/**", `${DOCCTX_DIR}/**` ];

/**
 * Resolves the files in scope for a doc or section and explains each one (DESIGN.md §9).
 *
 * Steps 1 to 3 merge the rules. Globs are then expanded, and excludes (step 4) and type rules
 * (step 5) are applied to the expanded files, since patterns can't be subtracted from patterns;
 * the result is the same as the §9 order. Files are deduplicated and sorted (step 6). A file
 * matched as both source and context is a source.
 *
 * @param manifest The doc's manifest; it need not be written yet, so `set_scope` can preview.
 * @param index Every manifest in the workspace, for the status of other docs in scope.
 * @param section Section key; omit for the whole doc.
 */
export async function resolveScope(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	manifest: DocManifest,
	index: ManifestIndex,
	section?: string
): Promise<ResolvedScope> {

	const rules = mergeScopeRules( config, manifest, section );
	const warnings: ScopeWarning[] = [];
	const excluded: PendingExclusion[] = [];
	const candidates = new Map<string, Candidate>();

	const includes: { readonly role: ScopeRole; readonly reason: ScopeReason }[] = [
		...rules.sources.map( ( reason ) => ( { "role": "source" as const, "reason": reason } ) ),
		...rules.context.map( ( reason ) => ( { "role": "context" as const, "reason": reason } ) )
	];
	for( const include of includes ) {
		const matches = await expand( root, include.reason.pattern );
		if( matches.files.length === 0 && matches.outside.length === 0 ) {
			warnings.push( { "kind": "no-match", "rule": include.reason.rule, "pattern": include.reason.pattern } );
		}
		for( const outside of matches.outside ) {
			addExcluded( excluded, outside, include.role, include.reason, { "kind": "outside-workspace" } );
		}
		for( const confined of matches.files ) {
			const existing = candidates.get( confined.relative );
			if( existing === undefined ) {
				candidates.set( confined.relative, {
					"role": include.role,
					"reasons": [ include.reason ],
					"confined": confined
				} );
			} else if( !hasReason( existing.reasons, include.reason ) ) {
				existing.reasons.push( include.reason );
			}
		}
	}

	// Step 4: exclude always wins. The first matching rule, in merge order, is reported
	const excludeMatchers = rules.exclude.map( ( reason ) => ( {
		"reason": reason,
		"isMatch": picomatch( reason.pattern, { "dot": true } )
	} ) );
	const remaining: Candidate[] = [];
	for( const candidate of candidates.values() ) {
		const matcher = excludeMatchers.find( ( entry ) => entry.isMatch( candidate.confined.relative ) );
		if( matcher !== undefined ) {
			excluded.push( {
				"path": candidate.confined.relative,
				"role": candidate.role,
				"reasons": candidate.reasons,
				"excludedBy": { "kind": "pattern", "rule": matcher.reason.rule, "pattern": matcher.reason.pattern }
			} );
		} else {
			remaining.push( candidate );
		}
	}

	// Step 5: drop tracked docs whose type excludes them at their status, and docs whose
	// status can't be known because their manifest is broken
	const included: Candidate[] = [];
	for( const candidate of remaining ) {
		const reason = typeRuleExclusion( config, index, candidate.confined.relative );
		if( reason === undefined ) {
			included.push( candidate );
			continue;
		}
		excluded.push( {
			"path": candidate.confined.relative,
			"role": candidate.role,
			"reasons": candidate.reasons,
			"excludedBy": reason
		} );
		if( reason.kind === "untracked-status" ) {
			const problem = index.problems.find( ( entry ) => entry.path === reason.manifest );
			warnings.push( {
				"kind": "unreadable-manifest",
				"manifest": reason.manifest,
				"message": problem?.message ?? ""
			} );
		}
	}

	// Step 6: sizes, then sort
	const sources: ScopeEntry[] = [];
	const context: ScopeEntry[] = [];
	let totalBytes = 0;
	for( const candidate of included ) {
		const stats = await stat( candidate.confined.absolute );
		const entry: ScopeEntry = {
			"path": candidate.confined.relative,
			"role": candidate.role,
			"sizeBytes": stats.size,
			"reasons": candidate.reasons
		};
		totalBytes += stats.size;
		if( candidate.role === "source" ) {
			sources.push( entry );
		} else {
			context.push( entry );
		}
	}
	sources.sort( byPath );
	context.sort( byPath );
	excluded.sort( byPath );

	const maxBytes = config.settings.max_context_bytes;
	if( totalBytes > maxBytes ) {
		warnings.push( { "kind": "over-budget", "totalBytes": totalBytes, "maxBytes": maxBytes } );
	}

	const scope: ResolvedScope = {
		"doc": manifest.doc,
		"sources": sources,
		"context": context,
		"excluded": excluded,
		"replaced": rules.replaced,
		"totalBytes": totalBytes,
		"warnings": warnings
	};
	if( section !== undefined ) {
		return { ...scope, "section": section };
	}
	return scope;
}

/**
 * Expands one pattern to confined files. Symlinked directories aren't followed, so a glob
 * can't walk out of the workspace or loop. Every symlink is confined like any path (§18): a
 * symlinked file inside the workspace is kept, a symlinked directory inside it is skipped, and
 * any symlink leading outside is reported.
 */
async function expand(
	root: WorkspaceRoot,
	pattern: string
): Promise<{ readonly files: readonly ConfinedPath[]; readonly outside: readonly string[] }> {

	const entries = await fg( pattern, {
		"cwd": root.absolute,
		"objectMode": true,
		"onlyFiles": false,
		"followSymbolicLinks": false,
		"dot": false,
		"caseSensitiveMatch": true,
		"ignore": ALWAYS_IGNORED
	} );

	const files: ConfinedPath[] = [];
	const outside: string[] = [];
	for( const entry of entries ) {
		if( entry.dirent.isDirectory() ) {
			continue;
		}
		let confined: ConfinedPath;
		try {
			confined = await root.resolve( entry.path );
		} catch( error ) {
			if( !( error instanceof PathOutsideWorkspaceError ) ) {
				throw error;
			}
			outside.push( entry.path );
			continue;
		}

		// A symlink inside the workspace counts only when it leads to a file
		if( entry.dirent.isSymbolicLink() && !( await stat( confined.absolute ) ).isFile() ) {
			continue;
		}
		files.push( confined );
	}
	return { "files": files, "outside": outside };
}

function typeRuleExclusion(
	config: WorkspaceConfig,
	index: ManifestIndex,
	path: string
): ExclusionReason | undefined {

	const tracked = index.manifests.get( path );
	if( tracked !== undefined ) {
		const docType = config.types.get( tracked.type );
		if( docType !== undefined && docType.exclude_from_context_when.includes( tracked.status ) ) {
			return {
				"kind": "type-rule",
				"rule": `types.${tracked.type}.exclude_from_context_when`,
				"type": tracked.type,
				"status": tracked.status
			};
		}
		return undefined;
	}
	const problem = index.problems.find( ( entry ) => entry.doc === path );
	if( problem !== undefined ) {
		return { "kind": "untracked-status", "manifest": problem.path };
	}
	return undefined;
}

function addExcluded(
	excluded: PendingExclusion[],
	path: string,
	role: ScopeRole,
	reason: ScopeReason,
	excludedBy: ExclusionReason
): void {

	const existing = excluded.find( ( entry ) => entry.path === path );
	if( existing === undefined ) {
		excluded.push( { "path": path, "role": role, "reasons": [ reason ], "excludedBy": excludedBy } );
	} else if( !hasReason( existing.reasons, reason ) ) {
		existing.reasons.push( reason );
	}
}

function hasReason( reasons: readonly ScopeReason[], reason: ScopeReason ): boolean {
	return reasons.some( ( entry ) => entry.rule === reason.rule && entry.pattern === reason.pattern );
}

function byPath( a: { readonly path: string }, b: { readonly path: string } ): number {
	return comparePaths( a.path, b.path );
}
