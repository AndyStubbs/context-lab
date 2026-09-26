/**
 * Why a manifest could not be written:
 * - `untracked`: the doc has no manifest, and no type and status were given to create one
 * - `changed-on-disk`: the manifest was created, edited or deleted after the update was
 *   prepared, so writing would discard that change
 */
export type ManifestWriteFailure = "untracked" | "changed-on-disk";

/**
 * Thrown when a prepared manifest update can't be made or written.
 */
export class ManifestWriteError extends Error {

	private readonly m_path: string;
	private readonly m_reason: ManifestWriteFailure;

	constructor( path: string, reason: ManifestWriteFailure ) {

		super( describe( path, reason ) );
		this.name = "ManifestWriteError";
		this.m_path = path;
		this.m_reason = reason;
	}

	/** Workspace-relative path of the manifest. */
	get path(): string {
		return this.m_path;
	}

	get reason(): ManifestWriteFailure {
		return this.m_reason;
	}
}

function describe( path: string, reason: ManifestWriteFailure ): string {

	switch( reason ) {
		case "untracked":
			return `No manifest at ${path}; a type and status are needed to create one`;
		case "changed-on-disk":
			return `${path} changed after the update was prepared; prepare it again`;
	}
}
