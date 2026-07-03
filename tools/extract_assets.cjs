#!/usr/bin/env node
"use strict";
/** One-time extractor: split index.html → css/main.css, js/math/survival.js, js/main.js */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcPath = process.argv[2] || path.join(root, "index.html");
let html = fs.readFileSync(srcPath, "utf8");

// If already slim, use git original
if (!html.includes('<style>')) {
  html = fs.readFileSync("/tmp/sls-index-orig.html", "utf8");
}

const cssMatch = html.match(/<style>\s*([\s\S]*?)<\/style>/);
if (!cssMatch) throw new Error("No <style> block");
fs.mkdirSync(path.join(root, "css"), { recursive: true });
fs.writeFileSync(path.join(root, "css/main.css"), cssMatch[1].trim() + "\n");

const scriptMatch = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>\s*<script>/);
if (!scriptMatch) throw new Error("No main <script> block");
const fullJs = '"use strict";\n' + scriptMatch[1].trim();

const mathEndMarker = "// ---------- anchor-constrained inversion (mixture-cure inverse fit to event anchors) ----------";
const mathEnd = fullJs.indexOf(mathEndMarker);
const mathStart = fullJs.indexOf("\nconst LN2 =");
if (mathEnd < 0 || mathStart < 0) throw new Error("Math boundaries not found");
const mathBlock = fullJs.slice(mathStart + 1, mathEnd).trim();

function collectExports(block) {
  const names = [];
  for (const line of block.split("\n")) {
    const cm = line.match(/^const (.+?)=(?:\{|[^;]*;)/);
    if (cm) {
      cm[1].split(",").forEach(part => {
        const n = part.trim().split("=")[0].trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) names.push(n);
      });
    }
    const fm = line.match(/^function ([a-zA-Z0-9_]+)/);
    if (fm) names.push(fm[1]);
  }
  return [...new Set(names)];
}

const exportNames = collectExports(mathBlock);
const survivalJs = mathBlock + "\n\nexport {\n  " + exportNames.join(",\n  ") + "\n};\n";
fs.mkdirSync(path.join(root, "js/math"), { recursive: true });
fs.writeFileSync(path.join(root, "js/math/survival.js"), survivalJs);

const beforeMath = fullJs.slice(0, mathStart).trim();
const appBody = fullJs.slice(mathEnd).trim();
const importStmt = "import {\n  " + exportNames.join(",\n  ") + "\n} from './math/survival.js';\n\n";
const mainJs = beforeMath + "\n\n" + importStmt + appBody + "\n";
fs.writeFileSync(path.join(root, "js/main.js"), mainJs);

const headEnd = html.indexOf("<style>");
const bodyStart = html.indexOf("</style>") + "</style>".length;
const analyticsMatch = html.match(/<script>\s*\(function\(\)\{[\s\S]*?\}\)\(\);\s*<\/script>/);
const analytics = analyticsMatch ? analyticsMatch[0] : "";
const scriptStart = html.indexOf('<script>\n"use strict";');
if (scriptStart < 0) throw new Error("Script start not found in HTML");

const newHtml = html.slice(0, headEnd) +
  '<link rel="stylesheet" href="css/main.css"/>\n' +
  html.slice(bodyStart, scriptStart) +
  '<script type="module" src="js/main.js"></script>\n' +
  analytics + "\n" +
  "</body>\n</html>\n";
fs.writeFileSync(path.join(root, "index.html"), newHtml);

console.log("Wrote css/main.css, js/math/survival.js (" + exportNames.length + " exports), js/main.js, index.html");
