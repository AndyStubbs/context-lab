/**
 * One problem found in a workspace config or manifest file, with a 1-based position.
 */
export interface ManifestIssue {

	/** Workspace-relative path of the file, with forward slashes. */
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
}

/**
 * Thrown when `workspace.yaml` or a manifest can't be parsed or fails validation. Carries every
 * issue found in the file, so a user can fix them in one pass (DESIGN.md §21).
 */
export class ManifestError extends Error {

	private readonly m_file: string;
	private readonly m_issues: readonly ManifestIssue[];

	/**
	 * @param issues At least one issue, all from `file`. They are sorted by position.
	 */
	constructor( file: string, issues: readonly ManifestIssue[] ) {

		const sorted = [ ...issues ].sort( compareIssues );
		super( sorted.map( formatIssue ).join( "\n" ) );
		this.name = "ManifestError";
		this.m_file = file;
		this.m_issues = sorted;
	}

	get file(): string {
		return this.m_file;
	}

	/** Sorted by line, then column. */
	get issues(): readonly ManifestIssue[] {
		return this.m_issues;
	}
}

function compareIssues( a: ManifestIssue, b: ManifestIssue ): number {

	if( a.line !== b.line ) {
		return a.line - b.line;
	}
	return a.column - b.column;
}

function formatIssue( issue: ManifestIssue ): string {
	return `${issue.file}:${issue.line}:${issue.column}: ${issue.message}`;
}
