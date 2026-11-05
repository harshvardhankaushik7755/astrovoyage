/**
 * The one Node API the tests use: reading a file from disk.
 *
 * Two tests read `src/styles.css` and work out real colour contrast from the real stylesheet, so the
 * game and its tests can never disagree about a colour. Vite's `?raw` import returns nothing for a CSS
 * file under vitest, and pulling in the whole of @types/node would hand the app code Node APIs it must
 * never use in a browser. This declares exactly what is needed and nothing else.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
