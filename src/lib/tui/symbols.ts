export type SymbolKey = string;
export type SymbolPreset = Record<string, string>;
export interface SymbolTheme extends Record<string, string> {}
export const defaultSymbols: SymbolPreset = {};
export function getSymbol(key: string): string { return key; }
export function resolveSymbolTheme(): SymbolTheme { return {} as SymbolTheme; }
