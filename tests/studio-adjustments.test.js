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
  assert.match(html, /assets\/xlsx\.full\.min\.js/);
  assert.match(app, /function exportRows\(\)/);
  assert.match(app, /XLSX\.writeFile/);
  assert.match(app, /"1D", "2D", "3D", "4D", "5D", "External", "Banners"/);
  assert.match(app, /lg-\$\{slug\(state\.country\)\}-global-ia-/);
});

test("export and logout controls use the requested visual treatment", () => {
  assert.match(html, /class="outline-button export-button"/);
  assert.match(html, /assets\/logout-exit\.png/);
  assert.match(html, /Brought to you by Concentrix/);
});

test("only depth-three-and-deeper IA nodes can become external links", () => {
  assert.match(app, /destination: "Local Page"/);
  assert.match(app, /data-action="toggle-destination"/);
  assert.match(app, /function canSetExternalLink\(node\)/);
  assert.match(app, /node\.depth >= 3/);
  assert.match(app, /if \(!info \|\| !canSetExternalLink\(info\.node\)\) return;/);
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
  assert.match(app, /COUNTRY_PATHS/);
  assert.match(app, /Bangladesh: "bd"/);
  assert.match(app, /function countryFromPath\(/);
  assert.match(app, /history\.replaceState/);
  assert.match(app, /window\.addEventListener\("popstate"/);
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
