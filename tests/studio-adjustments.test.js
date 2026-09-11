const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

const countries = [
  "Bangladesh", "New Zealand", "Srilanka", "Nepal", "Ukraine", "Uzbekistan_RU",
  "Uzbekistan", "Bulgaria", "Serbia", "Latvia", "Croatia", "Slovakia", "Denmark",
  "Finland", "Norway", "Lithuania", "Estonia", "Iran (RTL)",
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
