/**
 * Formats a size with 1000-based units and at most one decimal, as in DESIGN.md §14.2
 * ("14 KB"): `999 B`, `1.5 KB`, `200 KB`, `1.2 MB`.
 */
export function formatBytes( bytes: number ): string {

	if( bytes < 1000 ) {
		return `${bytes} B`;
	}
	const kilobytes = Math.round( bytes / 100 ) / 10;
	if( kilobytes < 1000 ) {
		return `${kilobytes} KB`;
	}
	return `${Math.round( bytes / 100000 ) / 10} MB`;
}
