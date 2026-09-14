const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const vm = require("node:vm");

function sourceIa() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "ia-data.js"), "utf8"), context);
  return context.window.IA_SOURCE;
}

function exportRowsFor(tree) {
  const start = app.indexOf("function exportRows()");
  const end = app.indexOf("\nfunction exportIA()", start);
  const source = app.slice(start, end);
  return new Function("tree", "effectiveEnabled", "visibleChildren", `${source}; return exportRows;`)(
    tree,
    (node) => node.enabled !== false,
    (node) => node.children.filter((child) => child.enabled !== false),
  )();
}

function renderMenuNodeFor(node) {
  const start = app.indexOf("function renderMenuNode(node)");
  const end = app.indexOf("\nfunction render()", start);
  const source = app.slice(start, end);
  return new Function("visibleChildren", "menuLabel", `${source}; return renderMenuNode;`)(
    (candidate) => candidate.children.filter((child) => child.enabled !== false),
    (candidate) => candidate.label,
  )(node);
}

const countries = [
  "Bangladesh", "New Zealand", "Srilanka", "Nepal", "Ukraine", "Uzbekistan_RU",
  "Uzbekistan", "Bulgaria", "Serbia", "Latvia", "Croatia", "Slovakia", "Denmark",
  "Finland", "Norway", "Lithuania", "Estonia", "Switzerland_DE", "Switzerland_FR",
];

test("studio header exposes country selector, save action, and logout icon", () => {
  assert.match(html, /<select[^>]+id="country-select"/);
  assert.match(html, /data-action="save"/);
  assert.match(html, /assets\/logout-exit\.png/);
  for (const country of countries) assert.match(html, new RegExp(`>${country.replace(/[()]/g, "\\$&")}<`));
});

test("IA explorer replaces the tree badge and permanent tip with a hoverable help control", () => {
  assert.doesNotMatch(html, /structure-badge|>TREE</);
  assert.doesNotMatch(html, /class="sidebar-tip"/);
  assert.match(html, /class="drag-help-button"/);
  assert.match(html, /Drag to reorder/);
});

test("country-aware draft state requires an explicit save and warns before discarding it", () => {
  assert.match(app, /COUNTRY_STORAGE_KEY/);
  assert.match(app, /function saveChanges\(\)/);
  assert.match(app, /async function switchCountry\(country/);
  assert.match(html, /Changes on the current GNB will not be saved\. Are you sure you want to switch\?/);
});

test("authenticated studios load and save the shared country IA through the Netlify API", () => {
  assert.match(app, /COUNTRY_IA_ENDPOINT/);
  assert.match(app, /function fetchCountryState\(country\)/);
  assert.match(app, /async function saveCountryState\(country, nextTree\)/);
  assert.match(app, /countryApiHeaders\(\)/);
});

test("studio renders the baseline before a country request and blocks switching while saving", () => {
  assert.match(app, /async function showStudio\(\)[\s\S]*resetViewState\(\);[\s\S]*render\(\);[\s\S]*await switchCountry/);
  assert.match(app, /state\.isSaving/);
});

test("export produces a country-specific Excel Global sheet in the source IA shape", () => {
  assert.match(html, /assets\/xlsx-js-style\.bundle\.js/);
  assert.match(app, /function exportRows\(\)/);
  assert.match(app, /XLSX\.writeFile/);
  assert.match(app, /"1D", "2D", "3D", "4D", "5D", "Destination", "Link-type", "Link-URL"/);
  assert.doesNotMatch(app, /"External", "Banners"/);
  assert.match(app, /fgColor: \{ rgb: "404040" \}/);
  assert.match(app, /color: \{ rgb: "FFFFFF" \}/);
  assert.match(app, /lg-\$\{slug\(state\.country\)\}-global-ia-/);
});

test("export and logout controls use the requested visual treatment", () => {
  assert.match(html, /class="outline-button export-button"/);
  assert.match(html, /assets\/logout-exit\.png/);
  assert.match(html, /Brought to you by Concentrix/);
});

test("depth-two-and-deeper IA nodes can become external links", () => {
  assert.match(app, /destination: "Local Page"/);
  assert.match(app, /data-action="toggle-destination"/);
  assert.match(app, /function canSetExternalLink\(node\)/);
  assert.match(app, /node\.depth >= 2/);
  assert.match(app, /if \(!info \|\| !canSetExternalLink\(info\.node\)\) return;/);
});

test("export writes one unmerged row for every enabled IA depth", () => {
  assert.match(app, /const path = \[\.\.\.parents, node\];[\s\S]*rows\.push\(\[\.\.\.levels/);
  assert.match(app, /for \(const child of visibleChildren\(node\)\) \{[\s\S]*visit\(child, path\);/);
  assert.doesNotMatch(app, /function hierarchyMerges\(/);
  assert.doesNotMatch(app, /sheet\["!merges"\]/);

  const rows = exportRowsFor([
    {
      label: "Solutions", enabled: true, external: null, banner: null, destination: "Local Page", linkType: "", linkUrl: "", children: [
        { label: "HVAC", enabled: true, destination: "External Link", linkType: "Global", linkUrl: "https://www.lg.com/global/business/hvac/", children: [
          { label: "Commercial Solutions", enabled: true, destination: "Local Page", linkType: "", linkUrl: "", children: [] },
        ] },
      ],
    },
  ]);

  assert.deepEqual(rows, [
    ["Solutions", "", "", "", "", "Local Page", "", ""],
    ["Solutions", "HVAC", "", "", "", "External Link", "Global", "https://www.lg.com/global/business/hvac/"],
    ["Solutions", "HVAC", "Commercial Solutions", "", "", "Local Page", "", ""],
  ]);
});

test("external-link editing is anchored beside its preview icon above the menu panel", () => {
  assert.match(app, /icon-blank-mid-gray2-14-14\.svg/);
  assert.match(app, /data-action="toggle-link-details"/);
  assert.match(app, /function renderExternalLinkControl\(node\)/);
  assert.match(app, /class="external-link-control"/);
  assert.match(app, /class="preview-link-details"/);
  assert.doesNotMatch(app, /class="link-details-button"/);
  assert.doesNotMatch(app, /class="link-details" data-id=/);
  assert.match(app, /Link-type/);
  assert.match(app, /Link-URL/);
  assert.match(app, /"Destination", "Link-type", "Link-URL"/);
  assert.match(css, /\.gnb-subnav \{[^}]*position: relative;[^}]*z-index: 2;/);
  assert.match(css, /\.gnb-menu-panel \{[^}]*position: relative;[^}]*z-index: 1;/);
});

test("local destinations export blank external-link fields", () => {
  assert.match(app, /node\.destination === "External Link" \? node\.linkType \|\| "" : ""/);
  assert.match(app, /node\.destination === "External Link" \? node\.linkUrl \|\| "" : ""/);
});

test("depth-three menu groups flow left to right while their descendants remain grouped below", () => {
  assert.match(app, /function renderMenuColumns\(nodes\)/);
  assert.match(app, /class="menu-columns"/);
  assert.match(app, /function renderMenuNode\(node\)/);
  assert.match(app, /class="menu-column"/);
  assert.match(app, /state\.linkDetailsOpen = new Set\(\);/);
  assert.match(css, /\.menu-columns \{ display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.external-link-control \{ position: relative;/);
});

test("selecting an explorer node opens its containing output menu without visual emphasis", () => {
  assert.match(app, /state\.activeChildId = nodePath\(id\)\[1\]\?\.id \|\| "";/);
  assert.match(app, /function focusPreviewNode\(id\)/);
  assert.match(app, /focusPreviewNode\(id\);/);
  assert.match(app, /data-preview-node-id="\$\{node\.id\}"/);
  assert.doesNotMatch(app, /preview-label \$\{node\.id === state\.selectedId \? "is-focused" : ""\}/);
  assert.doesNotMatch(css, /\.preview-label\.is-focused/);
  assert.doesNotMatch(css, /\.menu-list li span:hover/);
});

test("external-link editor has a top-right close control", () => {
  assert.match(app, /class="link-details-close"/);
  assert.match(app, /data-action="close-link-details"/);
  assert.match(app, /function closeLinkDetails\(id\)/);
  assert.match(css, /\.link-details-close \{ position: absolute;/);
});

test("static build emits country route entry points for direct local preview access", () => {
  const build = fs.readFileSync(path.join(root, "build-site.js"), "utf8");
  assert.match(build, /countryPaths/);
  assert.match(build, /path\.join\(output, countryPath, "index\.html"\)/);
});

test("Why LG is a two-depth branch and country selection is reflected in the URL", () => {
  assert.match(app, /function trimWhyLgDescendants\(/);
  assert.match(app, /const menuNodes = activeChild\?\.children\.length \? visibleChildren\(activeChild\) : \[\];/);
  assert.match(app, /const menuPanel = menuNodes\.length \? `<div class="gnb-menu-panel">\$\{renderMenuColumns\(menuNodes\)\}<\/div>` : "";/);
  assert.match(app, /COUNTRY_PATHS/);
  assert.match(app, /Bangladesh: "bd"/);
  assert.match(app, /function countryFromPath\(/);
  assert.match(app, /history\.replaceState/);
  assert.match(app, /window\.addEventListener\("popstate"/);
});

test("Insights copies only the Solutions second-depth labels", () => {
  const rows = sourceIa();
  const solutions = [];
  let activeRoot = "";
  for (const row of rows) {
    if (row.levels[0]) activeRoot = row.levels[0];
    if (activeRoot === "Solutions" && row.levels[1] && !solutions.includes(row.levels[1])) solutions.push(row.levels[1]);
  }
  const insightsIndex = rows.findIndex((row) => row.levels[0] === "Insights");
  const nextRootIndex = rows.findIndex((row, index) => index > insightsIndex && row.levels[0]);
  const insights = rows.slice(insightsIndex + 1, nextRootIndex < 0 ? undefined : nextRootIndex);

  assert.deepEqual(JSON.parse(JSON.stringify(insights.map((row) => row.levels[1]))), solutions);
  assert.ok(insights.every((row) => row.levels.slice(2).every((label) => label === null)));
  assert.match(app, /const baselineInsights = initialTree\.find/);
});

test("Consumer hover underlines its label without underlining the external-link arrow", () => {
  assert.match(app, /<span class="consumer-label">Consumer<\/span><span class="consumer-arrow"/);
  assert.match(css, /\.gnb-consumer:hover \.consumer-label \{ text-decoration: underline;/);
  assert.doesNotMatch(css, /\.gnb-consumer:hover \{ text-decoration: underline;/);
});

test("GNB preview omits fifth-depth descendants", () => {
  const preview = renderMenuNodeFor({
    label: "Fourth depth",
    depth: 4,
    enabled: true,
    children: [{ label: "Fifth depth", depth: 5, enabled: true, children: [] }],
  });

  assert.doesNotMatch(preview, /Fifth depth/);
});

test("the HVAC baseline follows the current Global IA menu", () => {
  const hvacRows = sourceIa().slice(1, 27);
  const structure = hvacRows.map((row) => row.levels.filter(Boolean));

  assert.deepEqual(JSON.parse(JSON.stringify(structure)), [
    ["Solutions", "HVAC", "Why LG HVAC", "Awards and Certifications"],
    ["Commercial Solutions", "VRF System"],
    ["Single Packaged"],
    ["Single Split"],
    ["Commercial ERV"],
    ["Air to Water Heat Pump"],
    ["Control Solutions"],
    ["Residential Solutions", "Air to Water Heat Pump"],
    ["Multi Split"],
    ["Residential ERV"],
    ["Water Heater"],
    ["Electric Water Heater"],
    ["Control Solutions"],
    ["Industrial Solutions", "Chiller"],
    ["Data Center Solutions"],
    ["Service & Maintenance", "VRF Annual Maintenance"],
    ["VRF Renewal Service"],
    ["Chiller Annual Maintenance"],
    ["Chiller Renewal Service"],
    ["Resources & Guides", "Resource Download"],
    ["Technical Data"],
    ["Tools & Software"],
    ["Video Guide"],
    ["Training Course"],
    ["Newsletter"],
    ["Insights"],
  ]);
});

test("Commercial Display baseline includes LG E-paper display under New & Featured", () => {
  const ePaper = sourceIa().find((row) => row.label === "LG E-paper display");

  assert.deepEqual(JSON.parse(JSON.stringify(ePaper?.levels)), [
    null,
    null,
    "New & Featured",
    "LG E-paper display",
    null,
  ]);
  assert.match(app, /function reconcileCommercialDisplayBaseline\(roots\)/);
  assert.match(app, /reconcileCommercialDisplayBaseline\(reconcileHvacBaseline\(clone\(candidate\)\)\)/);
});
