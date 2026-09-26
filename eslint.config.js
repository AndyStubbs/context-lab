import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Keeps core independent of the adapters (DESIGN.md §6): no imports from cli/, mcp/,
 * the MCP SDK or CLI parsing. Exported so the boundary can be tested on its own.
 *
 * @type {import( "eslint" ).Linter.Config}
 */
export const coreBoundary = {
	"files": [ "src/core/**/*.ts" ],
	"rules": {
		"no-restricted-imports": [ "error", {
			"paths": [
				{ "name": "commander", "message": "Core must not depend on CLI parsing." }
			],
			"patterns": [
				{
					"regex": "^@modelcontextprotocol/",
					"message": "Core must not depend on the MCP SDK."
				},
				{
					"regex": "(^|/)(cli|mcp)(/|$)",
					"message": "Core must not import from the cli/ or mcp/ adapters."
				}
			]
		} ]
	}
};

const houseStyle = {
	"plugins": { "@stylistic": stylistic },
	"rules": {
		"@stylistic/indent": [ "error", "tab", { "SwitchCase": 1 } ],
		"@stylistic/no-mixed-spaces-and-tabs": "error",
		"@stylistic/semi": [ "error", "always" ],
		"@stylistic/semi-spacing": "error",
		"@stylistic/no-extra-semi": "error",
		"@stylistic/quotes": [ "error", "double", { "allowTemplateLiterals": "never" } ],
		"@stylistic/brace-style": [ "error", "1tbs" ],
		"@stylistic/space-in-parens": [ "error", "always" ],
		"@stylistic/array-bracket-spacing": [ "error", "always" ],
		"@stylistic/object-curly-spacing": [ "error", "always" ],
		"@stylistic/computed-property-spacing": [ "error", "always" ],
		"@stylistic/template-curly-spacing": [ "error", "never" ],
		"@stylistic/keyword-spacing": [ "error", {
			"before": true,
			"after": true,
			"overrides": {
				"if": { "after": false },
				"for": { "after": false },
				"while": { "after": false },
				"switch": { "after": false },
				"catch": { "after": false }
			}
		} ],
		"@stylistic/space-before-blocks": "error",
		"@stylistic/space-before-function-paren": [ "error", {
			"anonymous": "never",
			"named": "never",
			"asyncArrow": "always",
			"catch": "never"
		} ],
		"@stylistic/function-call-spacing": [ "error", "never" ],
		"@stylistic/arrow-parens": [ "error", "always" ],
		"@stylistic/arrow-spacing": "error",
		"@stylistic/comma-spacing": "error",
		"@stylistic/key-spacing": "error",
		"@stylistic/space-infix-ops": "error",
		"@stylistic/type-annotation-spacing": "error",
		"@stylistic/member-delimiter-style": "error",
		"@stylistic/line-comment-position": [ "error", { "position": "above" } ],
		"@stylistic/lines-around-comment": [ "error", {
			"beforeLineComment": true,
			"allowBlockStart": true,
			"allowObjectStart": true,
			"allowArrayStart": true,
			"allowClassStart": true,
			"allowInterfaceStart": true,
			"allowTypeStart": true,
			"allowEnumStart": true,
			"allowModuleStart": true
		} ],
		"@stylistic/max-len": [ "error", {
			"code": 120,
			"tabWidth": 4,
			"ignoreUrls": true
		} ],
		"@stylistic/eol-last": "error",
		"@stylistic/no-trailing-spaces": "error",
		"@stylistic/no-multiple-empty-lines": [ "error", { "max": 2, "maxEOF": 0 } ],
		"curly": [ "error", "all" ],
		"no-ternary": "error",
		"no-var": "error",
		"prefer-const": "error",
		"no-restricted-syntax": [ "error", {
			"selector": "TSEnumDeclaration",
			"message": "Use a string union type instead of enum."
		} ]
	}
};

export default tseslint.config(
	{
		"ignores": [ "dist/", "coverage/", "node_modules/", "test/fixtures/" ]
	},
	js.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	{
		"languageOptions": {
			"globals": globals.node,
			"parserOptions": {
				"projectService": true,
				"tsconfigRootDir": import.meta.dirname
			}
		}
	},
	houseStyle,
	{
		"files": [ "**/*.ts" ],
		"rules": {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/naming-convention": [ "error", {
				"selector": "classProperty",
				"modifiers": [ "static" ],
				"format": null
			}, {
				"selector": "classProperty",
				"format": [ "camelCase" ],
				"prefix": [ "m_" ]
			} ]
		}
	},
	{
		"files": [ "**/*.js" ],
		...tseslint.configs.disableTypeChecked
	},
	coreBoundary,
	{
		"files": [ "src/mcp/**/*.ts" ],
		"rules": {

			// stdout carries JSON-RPC, so the server only logs to stderr
			"no-console": [ "error", { "allow": [ "error", "warn" ] } ]
		}
	}
);
