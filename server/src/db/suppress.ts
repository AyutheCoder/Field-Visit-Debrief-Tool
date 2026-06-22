// Suppresses the one-off ExperimentalWarning emitted by node:sqlite.
// Imported for its side effect BEFORE node:sqlite is required.
const originalEmit = process.emit;
process.emit = function (name: string | symbol, ...args: unknown[]): boolean {
    const warning = args[0] as { name?: string; message?: string } | undefined;
    if (
        name === 'warning' &&
        warning?.name === 'ExperimentalWarning' &&
        typeof warning.message === 'string' &&
        warning.message.includes('SQLite')
    ) {
        return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalEmit as any).call(process, name, ...args);
} as typeof process.emit;