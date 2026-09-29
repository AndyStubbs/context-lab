import type { ExclusionReason, ReplacedRule, ScopeReason } from "./resolved-scope.js";

/**
 * The rule and pattern that brought a file into scope, such as `sources: src/auth/**`. This
 * wording is shared by `docctx scope` and `get_scope`, so the explain view reads the same
 * everywhere (DESIGN.md §5 principle 5).
 */
export function describeReason( reason: ScopeReason ): string {
	return `${reason.rule}: ${reason.pattern}`;
}

/** Why a matched file was left out. */
export function describeExclusion( reason: ExclusionReason ): string {

	switch( reason.kind ) {
		case "pattern":
			return `${reason.rule}: ${reason.pattern}`;
		case "type-rule":
			return `${reason.rule} (status ${reason.status})`;
		case "untracked-status":
			return `status unknown: ${reason.manifest} is invalid`;
		case "outside-workspace":
			return "leads outside the workspace";
	}
}

/** Inherited patterns dropped by a narrower rule. */
export function describeReplaced( replaced: ReplacedRule ): string {
	return `${replaced.rule}, by ${replaced.by}`;
}
