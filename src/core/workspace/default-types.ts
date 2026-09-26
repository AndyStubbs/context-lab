import type { DocType, WorkspaceSettings } from "./workspace-config.js";

/**
 * The types that ship with ContextLabs, used when `workspace.yaml` defines none (DESIGN.md §11).
 * Defining any type replaces all of these.
 */
export const DEFAULT_TYPES: ReadonlyMap<string, DocType> = new Map( [
	[ "reference", {
		"statuses": [ "draft", "review", "published", "deprecated" ],
		"exclude_from_context_when": []
	} ],
	[ "guide", {
		"statuses": [ "draft", "review", "published", "deprecated" ],
		"exclude_from_context_when": []
	} ],
	[ "plan", {
		"statuses": [ "draft", "proposed", "decided", "superseded" ],
		"exclude_from_context_when": [ "superseded" ]
	} ]
] );

/** Settings used for anything `workspace.yaml` leaves out (DESIGN.md §8). */
export const DEFAULT_SETTINGS: WorkspaceSettings = {
	"hash_algorithm": "sha256",
	"max_context_bytes": 200000,
	"max_diff_bytes": 20000
};
