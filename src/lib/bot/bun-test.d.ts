// Narrow test-runner declarations; do not load Bun's runtime globals into Worker code.
declare module "bun:test" {
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void) => void;
  export const mock: {
    module: (path: string, factory: () => unknown) => void;
    restore: () => void;
  };
  export const expect: (value: unknown) => {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toBeGreaterThan: (expected: number) => void;
  };
}