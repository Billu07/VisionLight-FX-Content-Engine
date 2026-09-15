// Minimal typings for opentype.js — only what services/driftTypeset.ts uses. (The @types package
// pulls the DOM lib into the whole backend, which breaks Node's Blob typing in other services.)
declare module "opentype.js" {
  export interface RenderOptions {
    kerning?: boolean;
    letterSpacing?: number;
    features?: Record<string, boolean>;
  }
  export class Path {
    toPathData(decimalPlaces?: number): string;
  }
  export class Font {
    unitsPerEm: number;
    charToGlyphIndex(s: string): number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: RenderOptions): Path;
    getAdvanceWidth(text: string, fontSize: number, options?: RenderOptions): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
