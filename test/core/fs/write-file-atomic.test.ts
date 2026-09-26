import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../../../src/core/fs/write-file-atomic.js";

let m_sandbox: string;

beforeEach( async () => {
	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-atomic-" ) ) );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

describe( "writeFileAtomic", () => {

	it( "creates a file and replaces an existing one, leaving no temporary files", async () => {

		const target = path.join( m_sandbox, "a.yaml" );
		await writeFileAtomic( target, "one\n" );
		expect( await readFile( target, "utf8" ) ).toBe( "one\n" );

		await writeFile( target, "old\n" );
		await writeFileAtomic( target, "two\n" );
		expect( await readFile( target, "utf8" ) ).toBe( "two\n" );
		expect( await readdir( m_sandbox ) ).toEqual( [ "a.yaml" ] );
	} );

	it( "cleans up and rethrows when the target can't be replaced", async () => {

		// A directory can't be replaced by a file
		const target = path.join( m_sandbox, "dir" );
		await mkdir( target );
		await expect( writeFileAtomic( target, "x" ) ).rejects.toThrow();
		expect( await readdir( m_sandbox ) ).toEqual( [ "dir" ] );
	} );
} );
