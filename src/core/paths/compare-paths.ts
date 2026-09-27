/**
 * Orders workspace-relative paths by UTF-16 code unit, not locale, so sorted output is the
 * same on every OS and in every language setting.
 */
export function comparePaths( a: string, b: string ): number {

	if( a < b ) {
		return -1;
	}
	if( a > b ) {
		return 1;
	}
	return 0;
}
