/**
 * One heading, as key assignment needs it.
 */
export interface KeyInput {
	readonly slug: string;

	/** Index of the enclosing heading in the same list, if any. */
	readonly parent?: number;
}

/**
 * Keys for a doc's headings, in the same order as the input. `undefined` for a heading with an
 * empty slug, which can't be addressed.
 */
export interface KeyAssignment {
	readonly keys: readonly ( string | undefined )[];

	/** Indexes whose key got a numeric suffix because an earlier heading had the same path. */
	readonly suffixed: readonly { readonly index: number; readonly sameAs: number }[];
}

/**
 * Assigns section keys (DESIGN.md §10). A unique slug is its own key. Headings sharing a slug
 * are told apart by the shortest suffix of their slug path (`setup/install`) that no other
 * heading with that slug shares. When the whole path is shared, the first heading keeps it and
 * later ones get `-1`, `-2`, ... on the last segment, as GitHub does for anchors, skipping any
 * key already in use.
 */
export function assignSectionKeys( headings: readonly KeyInput[] ): KeyAssignment {

	const paths = headings.map( ( _heading, index ) => slugPath( headings, index ) );
	const bySlug = new Map<string, number[]>();
	headings.forEach( ( heading, index ) => {
		if( heading.slug.length > 0 ) {
			const group = bySlug.get( heading.slug ) ?? [];
			group.push( index );
			bySlug.set( heading.slug, group );
		}
	} );

	const keys: ( string | undefined )[] = headings.map( () => undefined );
	for( const group of bySlug.values() ) {
		for( const index of group ) {
			keys[ index ] = shortestUniqueSuffix( paths, group, index );
		}
	}

	// Whole-path collisions: the first keeps the key, later ones get a numeric suffix
	const used = new Set( keys.filter( ( key ) => key !== undefined ) );
	const firstWithKey = new Map<string, number>();
	const suffixed: { index: number; sameAs: number }[] = [];
	keys.forEach( ( key, index ) => {
		if( key === undefined ) {
			return;
		}
		const first = firstWithKey.get( key );
		if( first === undefined ) {
			firstWithKey.set( key, index );
			return;
		}
		let counter = 1;
		while( used.has( `${key}-${counter}` ) ) {
			counter++;
		}
		keys[ index ] = `${key}-${counter}`;
		used.add( `${key}-${counter}` );
		suffixed.push( { "index": index, "sameAs": first } );
	} );
	return { "keys": keys, "suffixed": suffixed };
}

/** Slugs from the outermost enclosing heading down to `index`, skipping empty slugs. */
function slugPath( headings: readonly KeyInput[], index: number ): readonly string[] {

	const path: string[] = [];
	let current: number | undefined = index;
	while( current !== undefined ) {
		const heading: KeyInput | undefined = headings[ current ];
		if( heading === undefined ) {
			break;
		}
		if( heading.slug.length > 0 ) {
			path.unshift( heading.slug );
		}
		current = heading.parent;
	}
	return path;
}

function shortestUniqueSuffix(
	paths: readonly ( readonly string[] )[],
	group: readonly number[],
	index: number
): string {

	const path = paths[ index ] ?? [];
	for( let length = 1; length < path.length; length++ ) {
		const candidate = suffix( path, length );
		const isShared = group.some(
			( other ) => other !== index && suffix( paths[ other ] ?? [], length ) === candidate
		);
		if( !isShared ) {
			return candidate;
		}
	}
	return path.join( "/" );
}

/** The last `length` segments, or the whole path when it is shorter. */
function suffix( path: readonly string[], length: number ): string {
	return path.slice( Math.max( 0, path.length - length ) ).join( "/" );
}
