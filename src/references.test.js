// Every component used in JSX must be defined or imported — catches a
// deleted-by-accident component before it reaches production.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "@babel/parser";
import { join } from "node:path";

const files = readdirSync("src").filter((f) => /\.jsx$/.test(f) && !/\.test\./.test(f)).map((f) => join("src", f));

describe("JSX references", () => {
  for (const file of files) {
    it(`${file}: every <Component> resolves`, () => {
      const src = readFileSync(file, "utf8");
      const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
      const defined = new Set();
      for (const n of ast.program.body) {
        const d = n.type === "ExportNamedDeclaration" || n.type === "ExportDefaultDeclaration" ? n.declaration : n;
        if (!d) continue;
        if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") defined.add(d.id.name);
        if (d.type === "VariableDeclaration") d.declarations.forEach((v) => v.id.name && defined.add(v.id.name));
        if (n.type === "ImportDeclaration") n.specifiers.forEach((s) => defined.add(s.local.name));
      }
      const used = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map((m) => m[1]));
      // components defined inside another function (local) are fine — only flag names defined nowhere in the file
      const missing = [...used].filter((n) => !defined.has(n) && !new RegExp(`(function|const|let)\\s+${n}\\b`).test(src));
      expect(missing).toEqual([]);
    });
  }
});
