/**
 * Lets `node --experimental-strip-types` follow the extensionless relative imports
 * that Next and the TS bundler resolver use (`import … from './csv'`).
 *
 * Raw Node ESM demands a file extension; Next does not. Rather than rewrite every
 * app import as './csv.ts' — or set allowImportingTsExtensions and hope Next agrees
 * — this hook appends the extension at resolve time. It exists purely so the tests
 * can import lib/*.ts directly. Nothing in app/ or lib/ knows about it.
 *
 * Used via `node --import ./scripts/ts-resolve.mjs --test …` (see package.json).
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Mirrors tsconfig's `"@/*": ["./*"]` path alias. */
const ROOT = new URL('../', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = new URL(specifier.slice(2), ROOT);
      for (const ext of ['', '.ts', '.tsx', '.js', '.json']) {
        const candidate = new URL(base.href + ext);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }

    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[mc]?[jt]sx?$|\.json$/.test(specifier);

    if (isRelative && !hasExtension && context.parentURL) {
      for (const ext of ['.ts', '.tsx', '.js']) {
        const candidate = new URL(specifier + ext, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + ext, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
