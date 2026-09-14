const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const output = path.join(root, "dist");
const files = ["index.html", "app.js", "ia-data.js", "styles.css"];
const countryPaths = ["bd", "nz", "lk", "np", "ua", "uz", "uz-ru", "bg", "rs", "lv", "hr", "sk", "dk", "fi", "no", "lt", "ee", "ch-de", "ch-fr"];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });

const countryIndex = fs.readFileSync(path.join(root, "index.html"), "utf8").replace("<head>", "<head><base href=\"/\" />");
for (const countryPath of countryPaths) {
  const countryOutput = path.join(output, countryPath);
  fs.mkdirSync(countryOutput, { recursive: true });
  fs.writeFileSync(path.join(output, countryPath, "index.html"), countryIndex);
}

console.log(`Built static site to ${path.relative(root, output)}`);
