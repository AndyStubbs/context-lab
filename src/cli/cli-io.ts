/**
 * Where the CLI reads its working directory and environment and writes its output, so tests
 * can run commands without touching `process`.
 */
export interface CliIo {
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly stdout: ( text: string ) => void;
	readonly stderr: ( text: string ) => void;
}
