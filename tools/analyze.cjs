const fs = require("fs");
const parser = require("@babel/parser");
const src = fs.readFileSync("src/RichR.jsx", "utf8");
const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
const out = [];
for (const n of ast.program.body) {
  const line = n.loc.start.line, end = n.loc.end.line;
  let names = [];
  if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") names = [n.id.name];
  else if (n.type === "VariableDeclaration") names = n.declarations.map(d => d.id.name || "(pattern)");
  else if (n.type === "ImportDeclaration") names = ["import:" + n.source.value];
  else if (n.type === "ExportNamedDeclaration") names = ["export"];
  else names = ["<" + n.type + ">"];
  out.push(`${line}-${end}\t${n.type.replace("Declaration","")}\t${names.join(",")}`);
}
fs.writeFileSync("/tmp/decls.txt", out.join("\n"));
console.log(out.length);
