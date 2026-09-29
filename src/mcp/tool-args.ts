import { z } from "zod";

/**
 * Argument schemas shared by the tools. Paths are workspace-relative, since the AI has no
 * current directory (ROADMAP.md Phase 3, decision 4).
 */
export const DOC_ARG = z.string().min( 1 ).describe( "Doc path, relative to the workspace root" );

/** A section key from the doc's outline, never a heading title. */
export const SECTION_ARG = z.string().min( 1 ).describe( "Section key from get_status, such as token-refresh" );
