declare namespace Bun {
    const env: NodeJS.ProcessEnv;
    function stringWidth(str: string): number;
    function stripANSI(str: string): string;
    function hash(data: string | ArrayBuffer, seed?: number | bigint): number;
}

type Timer = ReturnType<typeof setTimeout>;
