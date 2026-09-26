/** Lines only in the original text, and lines only in the rewritten text. */
export interface LineDiff {
	readonly removed: readonly string[];
	readonly added: readonly string[];
}

/**
 * A line diff from the longest common subsequence, enough to check that a rewrite touched
 * only the lines it should have.
 */
export function diffLines( before: string, after: string ): LineDiff {

	const a = before.split( "\n" );
	const b = after.split( "\n" );

	// lengths[ i ][ j ] is the LCS length of a[ i.. ] and b[ j.. ]
	const lengths = Array.from( { "length": a.length + 1 }, () => new Array<number>( b.length + 1 ).fill( 0 ) );
	for( let i = a.length - 1; i >= 0; i-- ) {
		for( let j = b.length - 1; j >= 0; j-- ) {
			const row = lengths[ i ] ?? [];
			if( a[ i ] === b[ j ] ) {
				row[ j ] = ( lengths[ i + 1 ]?.[ j + 1 ] ?? 0 ) + 1;
			} else {
				row[ j ] = Math.max( lengths[ i + 1 ]?.[ j ] ?? 0, row[ j + 1 ] ?? 0 );
			}
		}
	}

	const removed: string[] = [];
	const added: string[] = [];
	let i = 0;
	let j = 0;
	while( i < a.length && j < b.length ) {
		if( a[ i ] === b[ j ] ) {
			i++;
			j++;
		} else if( ( lengths[ i + 1 ]?.[ j ] ?? 0 ) >= ( lengths[ i ]?.[ j + 1 ] ?? 0 ) ) {
			removed.push( a[ i ] ?? "" );
			i++;
		} else {
			added.push( b[ j ] ?? "" );
			j++;
		}
	}
	removed.push( ...a.slice( i ) );
	added.push( ...b.slice( j ) );
	return { "removed": removed, "added": added };
}
