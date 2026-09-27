/**
 * Where the CLI reads its working directory and writes its output, so tests can run commands
 * without touching `process`.
 */
export interface CliIo {
	readonly cwd: string;
	readonly stdout: ( text: string ) => void;
	readonly stderr: ( text: string ) => void;
}
