import { describe, expect, it } from "vitest";
import { buildOutline, isMarkdownPath } from "../../../src/core/sections/build-outline.js";
import type { DocOutline } from "../../../src/core/sections/doc-outline.js";

function outline( ...lines: readonly string[] ): DocOutline {
	return buildOutline( "docs/a.md", `${lines.join( "\n" )}\n` );
}

function ranges( result: DocOutline ): readonly ( readonly [ string, number, number ] )[] {
	return result.sections.map( ( section ) => [ section.key, section.startLine, section.endLine ] as const );
}

describe( "buildOutline", () => {

	it( "runs each section to the next heading of the same or higher level", () => {

		const result = outline(
			"Preamble before any heading.",
			"# Guide",
			"Intro.",
			"## Install",
			"Steps.",
			"### Linux",
			"apt.",
			"## Use",
			"Run it.",
			"# Appendix"
		);
		expect( result.kind ).toBe( "markdown" );
		expect( result.lineCount ).toBe( 10 );
		expect( ranges( result ) ).toEqual( [
			[ "guide", 2, 9 ],
			[ "install", 4, 7 ],
			[ "linux", 6, 7 ],
			[ "use", 8, 9 ],
			[ "appendix", 10, 10 ]
		] );
		expect( result.sections.map( ( section ) => section.parentKey ) ).toEqual( [
			undefined, "guide", "install", "guide", undefined
		] );
	} );

	it( "records the title, slug and depth of each heading", () => {

		const result = outline( "## Token `refresh()` — *v2*!" );
		expect( result.sections ).toEqual( [ {
			"key": "token-refresh--v2",
			"slug": "token-refresh--v2",
			"title": "Token refresh() — v2!",
			"depth": 2,
			"startLine": 1,
			"endLine": 1
		} ] );
	} );

	it( "handles skipped heading levels", () => {

		const result = outline( "# Top", "#### Deep", "text", "## Middle" );
		expect( ranges( result ) ).toEqual( [ [ "top", 1, 4 ], [ "deep", 2, 3 ], [ "middle", 4, 4 ] ] );
		expect( result.sections[ 2 ]?.parentKey ).toBe( "top" );
	} );

	it( "recognizes setext headings", () => {

		const result = outline( "Guide", "=====", "", "Install", "-------", "Steps." );
		expect( ranges( result ) ).toEqual( [ [ "guide", 1, 6 ], [ "install", 4, 6 ] ] );
	} );

	it( "ignores headings in code blocks, block quotes and lists", () => {

		const result = outline(
			"# Real",
			"```",
			"# not a heading",
			"```",
			"> ## Quoted",
			"- ## Listed",
			"<h2>HTML</h2>"
		);
		expect( ranges( result ) ).toEqual( [ [ "real", 1, 7 ] ] );
	} );

	it( "skips YAML and TOML front matter", () => {

		expect( ranges( outline( "---", "title: Guide", "---", "# Guide" ) ) ).toEqual( [ [ "guide", 4, 4 ] ] );
		expect( ranges( outline( "+++", "title = \"Guide\"", "+++", "# Guide" ) ) ).toEqual( [ [ "guide", 4, 4 ] ] );
	} );

	it( "disambiguates duplicates by parent path and warns about order-dependent keys", () => {

		const result = outline( "# Setup", "## Install", "a", "## Install", "b", "# Upgrade", "## Install" );
		expect( result.sections.map( ( section ) => section.key ) ).toEqual( [
			"setup", "setup/install", "setup/install-1", "upgrade", "upgrade/install"
		] );
		expect( result.warnings ).toEqual( [ {
			"line": 4,
			"message": "section key `setup/install-1` depends on heading order: the heading on line 2 has the same path"
		} ] );
	} );

	it( "leaves out a heading without text but still ends the section before it", () => {

		const result = outline( "## One", "text", "##", "more" );
		expect( ranges( result ) ).toEqual( [ [ "one", 1, 2 ] ] );
		expect( result.warnings ).toEqual( [
			{ "line": 3, "message": "heading has no text, so it has no section key" }
		] );
	} );

	it( "counts lines with and without a trailing newline, and with CRLF", () => {

		expect( buildOutline( "a.md", "# A\ntext" ).lineCount ).toBe( 2 );
		expect( buildOutline( "a.md", "# A\ntext\n" ).lineCount ).toBe( 2 );
		expect( buildOutline( "a.md", "" ).lineCount ).toBe( 0 );
		const crlf = buildOutline( "a.md", "# A\r\ntext\r\n## B\r\n" );
		expect( ranges( crlf ) ).toEqual( [ [ "a", 1, 3 ], [ "b", 3, 3 ] ] );
	} );

	it( "treats non-markdown docs as a single unit", () => {

		const result = buildOutline( "api/openapi.yaml", "# not markdown\nopenapi: 3.1.0\n" );
		expect( result ).toEqual( {
			"doc": "api/openapi.yaml",
			"kind": "single",
			"sections": [],
			"warnings": [],
			"lineCount": 2
		} );
	} );
} );

describe( "isMarkdownPath", () => {

	it( "matches .md and .markdown in any case", () => {

		expect( isMarkdownPath( "docs/a.md" ) ).toBe( true );
		expect( isMarkdownPath( "docs/A.MD" ) ).toBe( true );
		expect( isMarkdownPath( "docs/a.markdown" ) ).toBe( true );
		expect( isMarkdownPath( "docs/a.mdx" ) ).toBe( false );
		expect( isMarkdownPath( "docs/md" ) ).toBe( false );
	} );
} );
