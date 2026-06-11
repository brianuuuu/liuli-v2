import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("./flashPagination.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
});

const tempDir = mkdtempSync(join(tmpdir(), "liuli-flash-pagination-"));
const compiledPath = join(tempDir, "flashPagination.mjs");
writeFileSync(compiledPath, output.outputText);

const { FLASH_PAGE_SIZE, shouldLoadNextFlashPage } = await import(pathToFileURL(compiledPath));

assert.equal(FLASH_PAGE_SIZE, 100);
assert.equal(shouldLoadNextFlashPage({ scrollTop: 700, clientHeight: 280, scrollHeight: 1000 }), true);
assert.equal(shouldLoadNextFlashPage({ scrollTop: 640, clientHeight: 280, scrollHeight: 1000 }), false);
assert.equal(shouldLoadNextFlashPage({ scrollTop: 700, clientHeight: 280, scrollHeight: 1000 }, 12), false);
