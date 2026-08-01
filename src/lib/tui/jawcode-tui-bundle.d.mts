export function visibleWidth(str: string): number;
export class TUI { constructor(terminal: unknown, showHardwareCursor?: boolean); }
export class Container { addChild(child: unknown): void; render(width: number): string[]; }
export class Text { constructor(text?: string, paddingX?: number, paddingY?: number); render(width: number): string[]; setText(text: string): void; }
export class Box { constructor(paddingX?: number, paddingY?: number, bgFn?: unknown); addChild(child: unknown): void; render(width: number): string[]; }
export class Loader { constructor(tui: unknown, colorFn: unknown, dimFn: unknown, message?: string); }
export class CancellableLoader extends Loader {}
export class Markdown { constructor(text: string, paddingX: number, paddingY: number, theme: unknown); render(width: number): string[]; setText(text: string): void; }
export class Spacer { constructor(lines?: number); render(width: number): string[]; }
export class SelectList { constructor(items: unknown[], theme: unknown, layout?: unknown); render(width: number): string[]; }
export class TruncatedText { constructor(text: string, paddingX?: number, paddingY?: number); render(width: number): string[]; }
export class ViewportFill { render(width: number): string[]; }
export const CURSOR_MARKER: string;
export function isFocusable(component: unknown): boolean;
export interface Component { render(width: number): string[]; }
export interface Focusable { focused: boolean; }
export interface OverlayOptions {}
export interface OverlayHandle {}
export type SizeValue = number | `${number}%`;
