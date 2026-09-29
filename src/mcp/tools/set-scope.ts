import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { NewManifestFields } from "../../core/manifest/manifest-editor.js";
import { docPathForManifest } from "../../core/manifest/manifest-paths.js";
import { ManifestWriteError } from "../../core/manifest/manifest-write-error.js";
import { writeManifestUpdate } from "../../core/manifest/manifest-writer.js";
import type { ScopeChange } from "../../core/manifest/scope-change.js";
import type { WorkspaceRoot } from "../../core/paths/workspace-root.js";
import type { ScopePreview } from "../../core/scope/preview-scope-change.js";
import { previewScopeChange } from "../../core/scope/preview-scope-change.js";
import type { WorkspaceConfig } from "../../core/workspace/workspace-config.js";
import { previewToken } from "../preview-token.js";
import { runTool } from "../run-tool.js";
import { scopeApprovalMessage } from "../scope-approval-message.js";
import { formatScopeResult } from "../scope-result.js";
import { DOC_ARG, SECTION_ARG } from "../tool-args.js";
import { errorResult, jsonBlock } from "../tool-result.js";

/**
 * How long the user has to answer the approval form. The SDK's 60 s default is too short for
 * someone reading the files involved.
 */
const ELICITATION_TIMEOUT_MS = 10 * 60 * 1000;

const PATTERNS = z.array( z.string().min( 1 ) );

const INPUT_SCHEMA = {
	"doc": DOC_ARG,
	"section": SECTION_ARG.optional(),
	"sources": PATTERNS.nullable().optional(),
	"context": z.union( [ PATTERNS, z.strictObject( { "replace": PATTERNS } ) ] ).nullable().optional(),
	"exclude": PATTERNS.nullable().optional(),
	"type": z.string().min( 1 ).optional().describe( "For a new manifest, with status" ),
	"status": z.string().min( 1 ).optional(),
	"audience": z.string().min( 1 ).optional(),
	"user_decision": z.enum( [ "accept", "decline" ] ).optional()
		.describe( "Without elicitation only: the user's answer to the preview" ),
	"preview_token": z.string().optional().describe( "Without elicitation only: from the preview" )
};

type SetScopeArgs = z.infer<z.ZodObject<typeof INPUT_SCHEMA>>;

const NEXT_STEP = "Show the user this message and ask them to accept or decline. Then call set_scope " +
	"again with the same arguments, user_decision and preview_token.";

/**
 * Registers `set_scope`: validates a proposed scope for a doc or section, asks the user, and
 * writes the manifest only if they accept (DESIGN.md §14.2; ROADMAP.md Phase 3, PR 2).
 *
 * With elicitation, the server asks the user itself and rejects `user_decision` and
 * `preview_token`. Without it, the first call returns a preview and a token, and a second call
 * with the user's decision and that token writes or drops the change.
 */
export function registerSetScope( server: McpServer, startDir: string ): void {

	server.registerTool( "set_scope", {
		"description": "Proposes sources, context or excludes for a doc or section; the user approves before " +
			"the server writes the manifest, which type and status create. A list replaces that field, null " +
			"removes it (a section then uses the doc's sources), and omitted fields are unchanged.",
		"inputSchema": INPUT_SCHEMA
	}, async ( args ) => runTool( startDir, async ( { root, config } ) => {

		const canElicit = server.server.getClientCapabilities()?.elicitation?.form !== undefined;
		if( canElicit && ( args.user_decision !== undefined || args.preview_token !== undefined ) ) {
			return errorResult(
				"This client supports elicitation, so the server asks the user directly. " +
				"Call set_scope without user_decision and preview_token."
			);
		}
		const create = newManifestFields( args );
		if( typeof create === "string" ) {
			return errorResult( create );
		}

		const change = scopeChange( args );
		let preview: ScopePreview;
		try {
			preview = await previewScopeChange( root, config, args.doc, change, create );
		} catch( error ) {
			if( error instanceof ManifestWriteError && error.reason === "untracked" ) {
				return errorResult( describeUntracked( error.path, config ) );
			}
			throw error;
		}
		if( !preview.update.changed ) {
			return { "content": [ jsonBlock( { "result": "unchanged", "manifest": preview.update.path } ) ] };
		}

		const message = scopeApprovalMessage( preview, change, create, config.settings.max_context_bytes );
		if( canElicit ) {
			return askUser( server, root, preview, message );
		}
		return decideInChat( args, root, config, preview, message );
	} ) );
}

/** Asks the user through an elicitation form, and writes only on accept. */
async function askUser(
	server: McpServer,
	root: WorkspaceRoot,
	preview: ScopePreview,
	message: string
): Promise<CallToolResult> {

	let action: "accept" | "decline" | "cancel";
	try {

		// No fields: the client's own Accept and Decline are the choice (PR 2 decision 3)
		const answer = await server.server.elicitInput( {
			"mode": "form",
			"message": message,
			"requestedSchema": { "type": "object", "properties": {} }
		}, { "timeout": ELICITATION_TIMEOUT_MS } );
		action = answer.action;
	} catch( error ) {
		if( error instanceof McpError && error.code === Number( ErrorCode.RequestTimeout ) ) {
			return { "content": [ jsonBlock( { "result": "timed-out", "manifest": preview.update.path } ) ] };
		}
		throw error;
	}

	switch( action ) {
		case "accept":
			return write( root, preview );
		case "decline":
			return { "content": [ jsonBlock( { "result": "declined", "manifest": preview.update.path } ) ] };
		case "cancel":
			return { "content": [ jsonBlock( { "result": "cancelled", "manifest": preview.update.path } ) ] };
	}
}

/**
 * The chat fallback: a preview and token first, then the user's decision with that token
 * (DESIGN.md §14.2).
 */
async function decideInChat(
	args: SetScopeArgs,
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	preview: ScopePreview,
	message: string
): Promise<CallToolResult> {

	const token = previewToken( proposalOf( args, preview ), preview );
	if( args.user_decision === undefined ) {
		if( args.preview_token !== undefined ) {
			return errorResult( "Pass user_decision with preview_token, once the user has answered." );
		}
		return { "content": [ jsonBlock( {
			"result": "preview",
			"message": message,
			"scope": formatScopeResult( preview.scope, config.settings.max_context_bytes ),
			"preview_token": token,
			"next": NEXT_STEP
		} ) ] };
	}

	if( args.preview_token === undefined ) {
		return errorResult(
			"user_decision needs the preview_token from a preview. Call set_scope without user_decision " +
			"first, and show the user the preview."
		);
	}
	if( args.preview_token !== token ) {
		return errorResult(
			"The proposal, the manifest or the files it resolves to changed since that preview. Call " +
			"set_scope without user_decision for a new preview, and show it to the user."
		);
	}
	if( args.user_decision === "decline" ) {
		return { "content": [ jsonBlock( { "result": "declined", "manifest": preview.update.path } ) ] };
	}
	return write( root, preview );
}

async function write( root: WorkspaceRoot, preview: ScopePreview ): Promise<CallToolResult> {

	await writeManifestUpdate( root, preview.update );
	return { "content": [ jsonBlock( {
		"result": "written",
		"manifest": preview.update.path,
		"created": preview.update.previousText === undefined
	} ) ] };
}

/** Type, status and audience for a new manifest, or a message when they're incomplete. */
function newManifestFields( args: SetScopeArgs ): NewManifestFields | undefined | string {

	if( args.type === undefined && args.status === undefined ) {
		if( args.audience !== undefined ) {
			return "audience only applies to a new manifest, so it needs type and status too.";
		}
		return undefined;
	}
	if( args.type === undefined || args.status === undefined ) {
		return "Pass type and status together; they create the doc's manifest.";
	}
	const fields: { -readonly [ K in keyof NewManifestFields ]: NewManifestFields[ K ] } = {
		"type": args.type,
		"status": args.status
	};
	if( args.audience !== undefined ) {
		fields.audience = args.audience;
	}
	return fields;
}

function scopeChange( args: SetScopeArgs ): ScopeChange {

	const change: { -readonly [ K in keyof ScopeChange ]: ScopeChange[ K ] } = {};
	if( args.section !== undefined ) {
		change.section = args.section;
	}
	if( args.sources !== undefined ) {
		change.sources = args.sources;
	}
	if( args.context !== undefined ) {
		change.context = args.context;
	}
	if( args.exclude !== undefined ) {
		change.exclude = args.exclude;
	}
	return change;
}

/**
 * The arguments that define the change, in a fixed key order, for the preview token. The doc
 * is normalized, so `./docs/a.md` and `docs/a.md` preview the same change. `JSON.stringify`
 * drops omitted fields and keeps `null`, so leaving a field alone and removing it differ.
 */
function proposalOf( args: SetScopeArgs, preview: ScopePreview ): unknown {

	return {
		"doc": preview.scope.doc,
		"section": args.section,
		"sources": args.sources,
		"context": args.context,
		"exclude": args.exclude,
		"type": args.type,
		"status": args.status,
		"audience": args.audience
	};
}

function describeUntracked( manifestPath: string, config: WorkspaceConfig ): string {

	const doc = docPathForManifest( manifestPath ) ?? manifestPath;
	const types = [ ...config.types ].map( ( [ name, type ] ) => `${name} (${type.statuses.join( ", " )})` );
	return `${doc} is not tracked yet. Pass type and status to create its manifest. ` +
		`Types and their statuses: ${types.join( "; " )}.`;
}
