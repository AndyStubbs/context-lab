import { runCli } from "../../src/cli/program.js";

/** What a CLI run printed, and its exit code. */
export interface CliResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

/** Runs `docctx` in-process with `cwd` as the working directory, capturing its output. */
export async function runDocctx( cwd: string, ...argv: readonly string[] ): Promise<CliResult> {

	let stdout = "";
	let stderr = "";
	const code = await runCli( argv, {
		"cwd": cwd,
		"env": {},
		"stdout": ( text ) => {
			stdout += text;
		},
		"stderr": ( text ) => {
			stderr += text;
		}
	} );
	return { "code": code, "stdout": stdout, "stderr": stderr };
}
