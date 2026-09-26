import path from "node:path";

/**
 * True for a path that is absolute on any platform, so manifests written on one OS can't
 * smuggle in a path that is absolute on another. Expects forward slashes.
 */
export function isAbsoluteOnAnyPlatform( slashed: string ): boolean {

	// win32.isAbsolute misses drive-relative paths such as `C:foo`, which are still not
	// workspace-relative
	return (
		path.posix.isAbsolute( slashed ) ||
		path.win32.isAbsolute( slashed ) ||
		/^[A-Za-z]:/.test( slashed )
	);
}
