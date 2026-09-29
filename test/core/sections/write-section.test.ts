import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SectionHistory } from "../../../src/core/history/section-history.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { UnknownSectionError } from "../../../src/core/scope/unknown-section-error.js";
import { UntrackedDocError } from "../../../src/core/scope/untracked-doc-error.js";
import { loadSection } from "../../../src/core/sections/load-section.js";
import { sectionHash } from "../../../src/core/sections/section-hash.js";
import { SectionWriteError } from "../../../src/core/sections/section-write-error.js";
import { writeSection } from "../../../src/core/sections/write-section.js";
import { readWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import { copyFixture, removeScratch } from "../../helpers/scratch-fixture.js";

const OVERVIEW = "docs/auth/overview.md";

let m_scratch: string | undefined;

afterEach( async () => {

	if( m_scratch !== undefined ) {
		await removeScratch( m_scratch );
	}
	m_scratch = undefined;
} );

/** A scratch copy of a fixture, and a writer for it that reads the section's hash first. */
async function workspace( fixture = "basic" ): Promise<{
	readonly root: WorkspaceRoot;
	readonly read: ( doc: string ) => Promise<string>;
	readonly write: ( doc: string, section: string | undefined, text: string ) => ReturnType<typeof writeSection>;
}> {

	const scratch = await copyFixture( fixture );
	m_scratch = scratch;
	const root = await WorkspaceRoot.open( scratch );
	const config = await readWorkspaceConfig( root );
	return {
		"root": root,
		"read": async ( doc ) => readFile( path.join( scratch, doc ), "utf8" ),
		"write": async ( doc, section, text ) => {
			const current = await loadSection( root, config, doc, section );
			return writeSection( root, config, doc, section, text, sectionHash( current.text ) );
		}
	};
}

async function refusal( pending: Promise<unknown> ): Promise<SectionWriteError> {

	let caught: unknown;
	try {
		await pending;
	} catch( error ) {
		caught = error;
	}
	expect( caught ).toBeInstanceOf( SectionWriteError );
	return caught as SectionWriteError;
}

describe( "writeSection", () => {

	it( "replaces one section, keeps its trailing blank line, and saves the previous text", async () => {

		const ws = await workspace();
		const text = "## Token refresh\n\nTokens refresh every 10 minutes.\n";
		const written = await ws.write( OVERVIEW, "token-refresh", text );
		expect( written ).toMatchObject( {
			"doc": OVERVIEW,
			"section": { "key": "token-refresh", "startLine": 5, "endLine": 8 },
			"lines": [ 5, 8 ],
			"history": { "number": 1, "path": ".docctx/.history/docs/auth/overview.md/token-refresh/0001.md" }
		} );

		const doc = await ws.read( OVERVIEW );
		expect( doc ).toContain( "## Token refresh\n\nTokens refresh every 10 minutes.\n\n## Error codes\n" );
		const saved = await new SectionHistory( ws.root ).read( OVERVIEW, "token-refresh", 1 );
		expect( saved ).toContain( "Access tokens expire after 15 minutes." );
	} );

	it( "trims the new text's trailing blank lines and keeps the section's own", async () => {

		const ws = await workspace();
		await ws.write( OVERVIEW, "token-refresh", "## Token refresh\n\nShort.\n\n\n\n" );
		expect( await ws.read( OVERVIEW ) ).toContain( "Short.\n\n## Error codes" );
	} );

	it( "rewrites subsections with their parent, and reports a renamed section's new key", async () => {

		const ws = await workspace();
		const written = await ws.write(
			OVERVIEW,
			"upgrade",
			"## Upgrading\n\n### Install\n\nRemove v1 first.\n\n### Migrate\n\nRun the migration.\n"
		);
		expect( written.section?.key ).toBe( "upgrading" );
		expect( written.lines ).toEqual( [ 23, 31 ] );
		expect( ( await ws.read( OVERVIEW ) ).endsWith( "### Migrate\n\nRun the migration.\n" ) ).toBe( true );
	} );

	it( "refuses a write when the section changed since it was read", async () => {

		const ws = await workspace();
		const root = ws.root;
		const config = await readWorkspaceConfig( root );
		const stale = sectionHash( ( await loadSection( root, config, OVERVIEW, "token-refresh" ) ).text );
		const doc = await ws.read( OVERVIEW );
		await writeFile( path.join( root.absolute, OVERVIEW ), doc.replace( "15 minutes", "20 minutes" ) );

		const pending = writeSection( root, config, OVERVIEW, "token-refresh", "## Token refresh\n", stale );
		const error = await refusal( pending );
		expect( error.reason ).toBe( "changed" );
		expect( error.message ).toContain( "docs/auth/overview.md § token-refresh changed since it was read" );
	} );

	it( "accepts a hash taken before an edit elsewhere in the doc", async () => {

		const ws = await workspace();
		const root = ws.root;
		const config = await readWorkspaceConfig( root );
		const hash = sectionHash( ( await loadSection( root, config, OVERVIEW, "token-refresh" ) ).text );
		const doc = await ws.read( OVERVIEW );
		const edited = doc.replace( "remove the old package", "uninstall v1" );
		await writeFile( path.join( root.absolute, OVERVIEW ), edited );

		await writeSection( root, config, OVERVIEW, "token-refresh", "## Token refresh\n\nNew.\n", hash );
		expect( await ws.read( OVERVIEW ) ).toContain( "uninstall v1" );
	} );

	it( "refuses new text that doesn't keep the section's shape", async () => {

		const ws = await workspace();
		const cases = [
			[ "Tokens refresh often.\n", "must start with a level 2 heading" ],
			[ "### Token refresh\n\nText.\n", "must start with a level 2 heading" ],
			[ "## Token refresh\n\nText.\n\n## Extra\n\nMore.\n", "only contain headings deeper than level 2" ],
			[ "## Token refresh\n\n```sh\ncurl /auth/refresh\n", "only contain headings deeper than level 2" ]
		] as const;
		for( const [ text, message ] of cases ) {
			const error = await refusal( ws.write( OVERVIEW, "token-refresh", text ) );
			expect( error.reason, text ).toBe( "shape" );
			expect( error.message, text ).toContain( message );
		}
	} );

	it( "refuses to rename a section that has its own scope", async () => {

		const ws = await workspace();
		const error = await refusal( ws.write( OVERVIEW, "token-refresh", "## Refreshing tokens\n\nText.\n" ) );
		expect( error.reason ).toBe( "orphans" );
		expect( error.message ).toContain( "matching no heading: token-refresh." );
	} );

	it( "refuses a write that shifts another section's key off its manifest entry", async () => {

		const ws = await workspace();
		const manifest = path.join( ws.root.absolute, ".docctx", `${OVERVIEW}.yaml` );
		const entry = "  setup/install:\n    sources: [src/auth/errors.ts]\n";
		await writeFile( manifest, `${await readFile( manifest, "utf8" )}${entry}` );

		// Without Upgrade's own Install, Setup's is plain `install`, so `setup/install` matches nothing
		const error = await refusal( ws.write( OVERVIEW, "upgrade", "## Upgrade\n\nReinstall.\n" ) );
		expect( error.reason ).toBe( "orphans" );
		expect( error.message ).toContain( "setup/install" );
	} );

	it( "writes nothing, not even history, when it refuses", async () => {

		const ws = await workspace();
		const before = await ws.read( OVERVIEW );
		await refusal( ws.write( OVERVIEW, "token-refresh", "No heading.\n" ) );
		expect( await ws.read( OVERVIEW ) ).toBe( before );
		expect( await new SectionHistory( ws.root ).list( OVERVIEW, "token-refresh" ) ).toEqual( [] );
	} );

	it( "keeps CRLF line endings and a missing final newline", async () => {

		const ws = await workspace();
		const file = path.join( ws.root.absolute, OVERVIEW );
		const crlf = ( await ws.read( OVERVIEW ) ).trimEnd().replaceAll( "\n", "\r\n" );
		await writeFile( file, crlf );

		await ws.write( OVERVIEW, "upgrade", "## Upgrade\n\n### Install\n\nNew text.\n" );
		const doc = await ws.read( OVERVIEW );
		expect( doc.endsWith( "### Install\r\n\r\nNew text." ) ).toBe( true );
		expect( doc.replaceAll( "\r\n", "" ).includes( "\n" ) ).toBe( false );
	} );

	it( "rewrites the whole of a doc without sections", async () => {

		const ws = await workspace( "scope" );
		const written = await ws.write( "api/openapi.yaml", undefined, "openapi: 3.1.0\n" );
		expect( written ).toMatchObject( { "doc": "api/openapi.yaml", "lines": [ 1, 1 ] } );
		expect( written.section ).toBeUndefined();
		expect( written.history.path ).toBe( ".docctx/.history/api/openapi.yaml/@doc/0001.yaml" );
		expect( await ws.read( "api/openapi.yaml" ) ).toBe( "openapi: 3.1.0\n" );
	} );

	it( "needs a section key for a doc with sections, a tracked doc, and a real section", async () => {

		const ws = await workspace();
		const config = await readWorkspaceConfig( ws.root );
		const whole = await refusal( writeSection( ws.root, config, OVERVIEW, undefined, "# New\n", "0" ) );
		expect( whole.reason ).toBe( "has-sections" );
		await expect( writeSection( ws.root, config, "docs/_style.md", undefined, "# Style\n", "0" ) )
			.rejects.toBeInstanceOf( UntrackedDocError );
		await expect( writeSection( ws.root, config, OVERVIEW, "install", "## Install\n", "0" ) )
			.rejects.toBeInstanceOf( UnknownSectionError );
	} );
} );
