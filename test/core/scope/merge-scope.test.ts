import { describe, expect, it } from "vitest";
import type { DocManifest } from "../../../src/core/manifest/doc-manifest.js";
import { mergeScopeRules } from "../../../src/core/scope/merge-scope.js";
import { defaultWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";

const CONFIG: WorkspaceConfig = {
	...defaultWorkspaceConfig(),
	"defaults": { "context": [ "docs/_style.md", "docs/_glossary.md" ], "exclude": [ "**/archive/**" ] }
};

function manifest( fields: Partial<DocManifest> ): DocManifest {
	return { "doc": "docs/a.md", "type": "guide", "status": "draft", "sections": new Map(), ...fields };
}

describe( "mergeScopeRules", () => {

	it( "starts from the workspace defaults", () => {

		expect( mergeScopeRules( CONFIG, manifest( {} ) ) ).toEqual( {
			"sources": [],
			"context": [
				{ "rule": "defaults.context", "pattern": "docs/_style.md" },
				{ "rule": "defaults.context", "pattern": "docs/_glossary.md" }
			],
			"exclude": [ { "rule": "defaults.exclude", "pattern": "**/archive/**" } ],
			"replaced": []
		} );
	} );

	it( "merges doc-level lists onto the defaults", () => {

		const rules = mergeScopeRules( CONFIG, manifest( {
			"sources": [ "src/**" ],
			"context": [ "docs/b.md" ],
			"exclude": [ "src/secret.ts" ]
		} ) );
		expect( rules.sources ).toEqual( [ { "rule": "sources", "pattern": "src/**" } ] );
		expect( rules.context.map( ( reason ) => reason.rule ) ).toEqual( [
			"defaults.context", "defaults.context", "context"
		] );
		expect( rules.exclude ).toEqual( [
			{ "rule": "defaults.exclude", "pattern": "**/archive/**" },
			{ "rule": "exclude", "pattern": "src/secret.ts" }
		] );
	} );

	it( "replaces the default context with a doc-level replace form", () => {

		const rules = mergeScopeRules( CONFIG, manifest( { "context": { "replace": [ "docs/b.md" ] } } ) );
		expect( rules.context ).toEqual( [ { "rule": "context", "pattern": "docs/b.md" } ] );
		expect( rules.replaced ).toEqual( [ { "rule": "defaults.context", "by": "context" } ] );
	} );

	it( "lets section sources replace the doc's sources", () => {

		const rules = mergeScopeRules( CONFIG, manifest( {
			"sources": [ "src/**" ],
			"sections": new Map( [ [ "install", { "sources": [ "src/install.ts" ] } ] ] )
		} ), "install" );
		expect( rules.sources ).toEqual( [ { "rule": "sections.install.sources", "pattern": "src/install.ts" } ] );
		expect( rules.replaced ).toEqual( [ { "rule": "sources", "by": "sections.install.sources" } ] );
	} );

	it( "merges section context and exclude onto the doc's", () => {

		const rules = mergeScopeRules( CONFIG, manifest( {
			"context": [ "docs/b.md" ],
			"exclude": [ "src/secret.ts" ],
			"sections": new Map( [ [ "install", { "context": [ "docs/c.md" ], "exclude": [ "src/old/**" ] } ] ] )
		} ), "install" );
		expect( rules.context.map( ( reason ) => `${reason.rule}:${reason.pattern}` ) ).toEqual( [
			"defaults.context:docs/_style.md",
			"defaults.context:docs/_glossary.md",
			"context:docs/b.md",
			"sections.install.context:docs/c.md"
		] );
		expect( rules.exclude.map( ( reason ) => reason.rule ) ).toEqual( [
			"defaults.exclude", "exclude", "sections.install.exclude"
		] );
		expect( rules.replaced ).toEqual( [] );
	} );

	it( "records every rule a section replace form drops", () => {

		const rules = mergeScopeRules( CONFIG, manifest( {
			"context": [ "docs/b.md" ],
			"sections": new Map( [ [ "install", { "context": { "replace": [] } } ] ] )
		} ), "install" );
		expect( rules.context ).toEqual( [] );
		expect( rules.replaced ).toEqual( [
			{ "rule": "defaults.context", "by": "sections.install.context" },
			{ "rule": "context", "by": "sections.install.context" }
		] );
	} );

	it( "doesn't record a replace that drops nothing", () => {

		const config = { ...CONFIG, "defaults": { "context": [], "exclude": [] } };
		const rules = mergeScopeRules( config, manifest( {
			"sections": new Map( [
				[ "install", { "sources": [ "src/a.ts" ], "context": { "replace": [ "a.md" ] } } ]
			] )
		} ), "install" );
		expect( rules.replaced ).toEqual( [] );
	} );

	it( "gives a section without a manifest entry the doc-level rules", () => {

		const doc = manifest( { "sources": [ "src/**" ] } );
		expect( mergeScopeRules( CONFIG, doc, "legacy" ) ).toEqual( mergeScopeRules( CONFIG, doc ) );
	} );
} );
