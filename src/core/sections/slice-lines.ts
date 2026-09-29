/**
 * Returns lines `startLine` to `endLine` of `text` (1-based, inclusive), with their line
 * endings kept as written, so the slice can be put back without changing the file.
 */
export function sliceLines( text: string, startLine: number, endLine: number ): string {

	// Splitting after each "\n" keeps "\r\n" endings whole
	const lines = text.split( /(?<=\n)/ );
	return lines.slice( startLine - 1, endLine ).join( "" );
}
