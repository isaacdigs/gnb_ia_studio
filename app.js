const { IA_SOURCE, IA_META } = window;

// Local-only fallback. Production authentication is handled by Netlify's STUDIO_PASSWORD secret.
const LOCAL_DEVELOPMENT_PASSWORD = "[REDACTED]";
const AUTH_ENDPOINT = "/.netlify/functions/auth";
const AUTH_KEY = "lg-gnb-studio-auth";
const AUTH_TOKEN_KEY = "lg-gnb-studio-token";
const COUNTRY_IA_ENDPOINT = "/.netlify/functions/country-ia";
const STORAGE_KEY = "lg-gnb-studio-tree-v2";
const COUNTRY_STORAGE_KEY = "lg-gnb-studio-countries-v1";
const COUNTRIES = ["Bangladesh", "New Zealand", "Srilanka", "Nepal", "Ukraine", "Uzbekistan_RU", "Uzbekistan", "Bulgaria", "Serbia", "Latvia", "Croatia", "Slovakia", "Denmark", "Finland", "Norway", "Lithuania", "Estonia", "Iran (RTL)"];

const initialTree = buildTree(IA_SOURCE);
const initialCountryState = sessionStorage.getItem(AUTH_TOKEN_KEY) ? null : loadCountryState(COUNTRIES[0]);
let tree = initialCountryState?.tree || clone(initialTree);
const defaultSelection = findFirstByLabel(tree, "Solutions") || tree[0];
const state = {
  authToken: sessionStorage.getItem(AUTH_TOKEN_KEY) || "",
  country: COUNTRIES[0],
  dirty: false,
  lastSavedAt: initialCountryState?.savedAt || null,
  pendingCountry: null,
  selectedId: defaultSelection?.id || "",
  previewRootId: rootIdFor(defaultSelection?.id) || tree[0]?.id || "",
  activeChildId: "",
  expanded: new Set(tree.filter((node) => node.depth <= 1).map((node) => node.id)),
  search: "",
  dragId: null,
  dropMode: null,
};

const ui = {
  loginScreen: document.querySelector("#login-screen"),
  studio: document.querySelector("#studio"),
  loginForm: document.querySelector("#login-form"),
  passwordInput: document.querySelector("#password-input"),
  loginError: document.querySelector("#login-error"),
  tree: document.querySelector("#tree"),
  treeSearch: document.querySelector("#tree-search"),
  treeSummary: document.querySelector("#tree-summary"),
  preview: document.querySelector("#gnb-preview"),
  saveState: document.querySelector("#save-state"),
  saveButton: document.querySelector("[data-action='save']"),
  countrySelect: document.querySelector("#country-select"),
  countryConfirm: document.querySelector("#country-confirm"),
  toast: document.querySelector("#toast"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildTree(rows) {
  const roots = [];
  const current = [];

  for (const row of rows.filter((candidate) => {
    const firstLabel = candidate.levels.find((label) => label);
    const rootLabel = String(firstLabel || "").trim().toLowerCase();
    return rootLabel !== "consumer" && !candidate.levels.some((label) => String(label || "").trim().toLowerCase() === "contact us");
  })) {
    for (let level = 0; level < row.levels.length; level += 1) {
      const label = row.levels[level];
      if (!label) continue;

      let parent = level === 0 ? null : current[level - 1];
      if (!parent && level > 0) {
        for (let fallback = level - 1; fallback >= 0; fallback -= 1) {
          if (current[fallback]) {
            parent = current[fallback];
            break;
          }
        }
      }

      const siblings = parent ? parent.children : roots;
      let node = siblings.find((candidate) => candidate.label.toLowerCase() === label.toLowerCase());
      if (!node) {
        node = {
          id: `node-${row.sourceRow}-${level + 1}-${slug(label)}`,
          label,
          depth: level + 1,
          enabled: true,
          children: [],
          sourceRows: [],
          external: null,
          banner: null,
        };
        siblings.push(node);
      }
      if (!node.sourceRows.includes(row.sourceRow)) node.sourceRows.push(row.sourceRow);
      if (level === 0 && row.external) node.external = row.external;
      if (level === 0 && row.banner) node.banner = row.banner;
      current[level] = node;
      current.length = level + 1;
    }
  }
  return roots;
}

function isValidTree(candidate) {
  return Array.isArray(candidate) && candidate.every((node) => node && node.label && Array.isArray(node.children));
}

function loadCountryStates() {
  try {
    const saved = JSON.parse(localStorage.getItem(COUNTRY_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function loadCountryState(country) {
  const record = loadCountryStates()[country];
  if (record && isValidTree(record.tree)) return record;
  if (country === COUNTRIES[0]) {
    try {
      const legacyTree = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (isValidTree(legacyTree)) return { tree: legacyTree, savedAt: null };
    } catch {}
  }
  return null;
}

function isSharedSession() {
  return Boolean(state.authToken);
}

function countryApiHeaders() {
  return isSharedSession() ? { Authorization: `Bearer ${state.authToken}` } : {};
}

async function fetchCountryState(country) {
  if (!isSharedSession()) return loadCountryState(country);
  const response = await fetch(`${COUNTRY_IA_ENDPOINT}?country=${encodeURIComponent(country)}`, { headers: countryApiHeaders() });
  if (!response.ok) throw new Error("Unable to load the shared IA");
  const { record } = await response.json();
  return record && isValidTree(record.tree) ? record : null;
}

async function saveCountryState(country, nextTree) {
  if (!isSharedSession()) {
    const savedAt = new Date().toISOString();
    const countries = loadCountryStates();
    countries[country] = { tree: clone(nextTree), savedAt };
    localStorage.setItem(COUNTRY_STORAGE_KEY, JSON.stringify(countries));
    return countries[country];
  }

  const response = await fetch(`${COUNTRY_IA_ENDPOINT}?country=${encodeURIComponent(country)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...countryApiHeaders() },
    body: JSON.stringify({ tree: nextTree }),
  });
  if (!response.ok) throw new Error("Unable to save the shared IA");
  return (await response.json()).record;
}

function savedTimeLabel(savedAt) {
  const location = isSharedSession() ? "Saved for team" : "Saved locally";
  if (!savedAt) return location;
  return `${location} · ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function renderSaveControls() {
  ui.saveButton.disabled = !state.dirty;
  ui.saveState.innerHTML = `<span class="save-dot ${state.dirty ? "is-unsaved" : ""}"></span>${state.dirty ? "Unsaved changes" : savedTimeLabel(state.lastSavedAt)}`;
}

function markDirty() {
  state.dirty = true;
  renderSaveControls();
}

async function saveChanges() {
  ui.saveButton.disabled = true;
  try {
    const record = await saveCountryState(state.country, tree);
    state.lastSavedAt = record.savedAt;
    state.dirty = false;
    renderSaveControls();
    showToast(`${state.country} IA saved${isSharedSession() ? " for the team" : " locally"}.`);
  } catch {
    renderSaveControls();
    showToast("Could not save the shared IA. Your changes are still open here.");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function eachNode(nodes, callback, parent = null) {
  for (const node of nodes) {
    callback(node, parent);
    eachNode(node.children, callback, node);
  }
}

function allNodes() {
  const result = [];
  eachNode(tree, (node, parent) => result.push({ node, parent }));
  return result;
}

function findNode(id, nodes = tree, parent = null) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parent, siblings: nodes, index };
    const found = findNode(id, node.children, node);
    if (found) return found;
  }
  return null;
}

function findFirstByLabel(nodes, label) {
  for (const node of nodes) {
    if (node.label === label) return node;
    const found = findFirstByLabel(node.children, label);
    if (found) return found;
  }
  return null;
}

function rootIdFor(id) {
  let found = findNode(id);
  if (!found) return null;
  while (found.parent) {
    found = findNode(found.parent.id);
  }
  return found.node.id;
}

function nodePath(id) {
  const path = [];
  function walk(nodes, parents = []) {
    for (const node of nodes) {
      if (node.id === id) {
        path.push(...parents, node);
        return true;
      }
      if (walk(node.children, [...parents, node])) return true;
    }
    return false;
  }
  walk(tree);
  return path;
}

function isDescendant(candidate, possibleAncestor) {
  return possibleAncestor.children.some((child) => child.id === candidate.id || isDescendant(candidate, child));
}

function effectiveEnabled(node) {
  const path = nodePath(node.id);
  return path.every((item) => item.enabled);
}

function matchesSearch(node) {
  return !state.search || node.label.toLowerCase().includes(state.search.toLowerCase());
}

function branchMatches(node) {
  return matchesSearch(node) || node.children.some(branchMatches);
}

function visibleChildren(node) {
  return node.children.filter((child) => effectiveEnabled(child));
}

function renderTree() {
  const content = renderBranch(tree, 0);
  ui.tree.innerHTML = content || `<div class="tree-empty">No IA labels match <strong>${escapeHtml(state.search)}</strong>.<br />Try another filter.</div>`;
  const nodes = allNodes();
  const active = nodes.filter(({ node }) => effectiveEnabled(node)).length;
  ui.treeSummary.innerHTML = `<span><strong>${active}</strong> active / ${nodes.length} nodes</span><span>Drag to organize</span>`;
}

function renderBranch(nodes, level) {
  return nodes.filter(branchMatches).map((node) => {
    const hasChildren = node.children.length > 0;
    const expanded = state.search ? true : state.expanded.has(node.id);
    const selected = node.id === state.selectedId;
    const effective = effectiveEnabled(node);
    const childMarkup = hasChildren && expanded ? `<ul class="tree-branch">${renderBranch(node.children, level + 1)}</ul>` : "";
    const childrenMatch = node.children.some(branchMatches);
    const partial = node.enabled && !effective;
    return `<li class="tree-item" role="none">
      <div class="tree-row ${selected ? "is-selected" : ""} ${node.enabled ? "" : "is-disabled"} ${partial ? "is-inherited-off" : ""}" style="--level:${level}" draggable="true" data-id="${node.id}" role="treeitem" aria-level="${level + 1}" aria-selected="${selected}" aria-expanded="${hasChildren ? expanded : "false"}">
        <button class="expand-button ${hasChildren ? "" : "empty"}" data-action="toggle-expand" data-id="${node.id}" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(node.label)}">${hasChildren ? (expanded ? "⌄" : "›") : "·"}</button>
        <button class="node-toggle ${node.enabled ? "enabled" : ""} ${partial ? "partial" : ""}" data-action="toggle-node" data-id="${node.id}" aria-label="${node.enabled ? "Disable" : "Enable"} ${escapeHtml(node.label)}" aria-checked="${node.enabled}">${node.enabled ? "✓" : ""}</button>
        <span class="node-label" title="${escapeHtml(node.label)}">${escapeHtml(node.label)}</span>
        <span class="node-meta">D${node.depth}${hasChildren ? ` · ${node.children.length}` : ""}</span>
        <span class="drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
      </div>
      ${childMarkup}
      ${state.search && !childrenMatch && !matchesSearch(node) ? "" : ""}
    </li>`;
  }).join("");
}

function logoMarkup(className = "") {
  return `<img class="lg-logo ${className}" src="assets/lg-logo.png" alt="LG" />`;
}

function renderPreview() {
  const activeRoots = tree.filter((root) => !["contact us", "consumer"].includes(root.label.trim().toLowerCase()) && effectiveEnabled(root));
  let activeRoot = findNode(state.previewRootId)?.node;
  if (!activeRoot || ["contact us", "consumer"].includes(activeRoot.label.trim().toLowerCase()) || !effectiveEnabled(activeRoot)) activeRoot = activeRoots[0];
  if (activeRoot) state.previewRootId = activeRoot.id;

  const nav = activeRoots.map((root) => {
    const isActive = root.id === activeRoot?.id;
    return `<button class="gnb-nav-item ${isActive ? "active" : ""}" data-action="preview-root" data-id="${root.id}">${escapeHtml(root.label)}</button>`;
  }).join("");

  const menu = activeRoot ? renderMenuPanel(activeRoot) : `<div class="menu-overflow">No active navigation items.</div>`;
  ui.preview.innerHTML = `<div class="gnb-mainbar"><div class="gnb-logo">${logoMarkup()}</div><nav class="gnb-nav" aria-label="Business navigation">${nav}</nav><div class="gnb-utilities"><a class="gnb-consumer" href="#consumer">Consumer <span class="consumer-arrow" aria-hidden="true">↗</span></a><button class="gnb-contact" type="button">Contact us</button><button class="gnb-search" type="button" aria-label="Search"></button></div></div>${menu}`;
}

function renderMenuPanel(root) {
  const children = visibleChildren(root);
  const preferredChild = root.label === "Solutions" ? children.find((child) => child.label === "Commercial Display") : null;
  const activeChild = children.find((child) => child.id === state.activeChildId) || preferredChild || children[0];
  state.activeChildId = activeChild?.id || "";
  const subnav = children.length ? `<div class="gnb-subnav" aria-label="${escapeHtml(root.label)} categories">${children.map((child) => `<button class="gnb-subnav-item ${child.id === activeChild?.id ? "active" : ""}" data-action="preview-child" data-id="${child.id}">${escapeHtml(child.label)}</button>`).join("")}</div>` : "";
  const menuNodes = activeChild ? (activeChild.children.length ? visibleChildren(activeChild) : [activeChild]) : [];
  const columns = menuNodes.map((child) => {
    const nestedNodes = child.children.length ? visibleChildren(child) : [child];
    return `<div class="menu-column"><h4>${escapeHtml(child.label)}</h4><ul class="menu-list">${nestedNodes.map(renderMenuNode).join("")}</ul></div>`;
  }).join("");
  return `${subnav}<div class="gnb-menu-panel">${columns ? `<div class="menu-columns">${columns}</div>` : `<div class="menu-overflow">This item has no nested categories yet.</div>`}</div>`;
}

function renderMenuNode(node) {
  const children = visibleChildren(node);
  const className = children.length ? "group" : "";
  return `<li class="${className}"><span>${escapeHtml(node.label)}</span>${children.length ? `<ul>${children.map(renderMenuNode).join("")}</ul>` : ""}</li>`;
}

function render() {
  renderTree();
  renderPreview();
}

function selectNode(id) {
  const info = findNode(id);
  if (!info) return;
  state.selectedId = id;
  state.previewRootId = rootIdFor(id) || state.previewRootId;
  state.activeChildId = "";
  let parent = info.parent;
  while (parent) {
    state.expanded.add(parent.id);
    parent = findNode(parent.id)?.parent;
  }
  render();
}

function toggleNode(id) {
  const info = findNode(id);
  if (!info) return;
  info.node.enabled = !info.node.enabled;
  state.selectedId = id;
  markDirty();
  render();
  showToast(`${info.node.label} ${info.node.enabled ? "included" : "excluded"} from the preview.`);
}

function toggleExpand(id) {
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  renderTree();
}

function moveNode(id, targetId, mode = "before") {
  const source = findNode(id);
  const target = findNode(targetId);
  if (!source || !target || id === targetId || isDescendant(target.node, source.node)) return;
  source.siblings.splice(source.index, 1);

  if (mode === "inside") {
    target.node.children.push(source.node);
    state.expanded.add(target.node.id);
  } else {
    const targetSiblings = target.parent ? target.parent.children : tree;
    const targetIndex = targetSiblings.indexOf(target.node);
    const insertAt = targetIndex + (mode === "after" ? 1 : 0);
    targetSiblings.splice(insertAt, 0, source.node);
  }
  state.selectedId = id;
  state.previewRootId = rootIdFor(id) || state.previewRootId;
  state.activeChildId = "";
  markDirty();
  render();
  showToast(mode === "inside" ? `Nested ${source.node.label} under ${target.node.label}.` : `Moved ${source.node.label}.`);
}

function resetTree() {
  tree = clone(initialTree);
  state.selectedId = defaultSelection?.id || tree[0]?.id || "";
  state.previewRootId = rootIdFor(state.selectedId) || tree[0]?.id || "";
  state.activeChildId = "";
  state.expanded = new Set(tree.filter((node) => node.depth <= 1).map((node) => node.id));
  markDirty();
  render();
  showToast("IA reset to the workbook baseline.");
}

function resetViewState() {
  const selection = findFirstByLabel(tree, "Solutions") || tree[0];
  state.selectedId = selection?.id || "";
  state.previewRootId = rootIdFor(selection?.id) || tree[0]?.id || "";
  state.activeChildId = "";
  state.expanded = new Set(tree.filter((node) => node.depth <= 1).map((node) => node.id));
  state.search = "";
  ui.treeSearch.value = "";
}

async function switchCountry(country, { force = false } = {}) {
  if (!COUNTRIES.includes(country) || (!force && country === state.country)) return;
  try {
    const saved = await fetchCountryState(country);
    tree = saved?.tree ? clone(saved.tree) : clone(initialTree);
    state.country = country;
    state.lastSavedAt = saved?.savedAt || null;
    state.dirty = false;
    state.pendingCountry = null;
    ui.countrySelect.value = country;
    ui.countryConfirm.classList.add("hidden");
    resetViewState();
    renderSaveControls();
    render();
    showToast(`${country} IA loaded.`);
  } catch {
    ui.countrySelect.value = state.country;
    showToast("Could not load the shared IA. Please try again.");
  }
}

function requestCountrySwitch(country) {
  if (country === state.country) return;
  if (!state.dirty) {
    switchCountry(country);
    return;
  }
  state.pendingCountry = country;
  ui.countrySelect.value = state.country;
  ui.countryConfirm.classList.remove("hidden");
  ui.countryConfirm.querySelector("[data-action='cancel-country-switch']").focus();
}

function exportRows() {
  const rows = [];

  function visit(node, parents = []) {
    if (!effectiveEnabled(node)) return;
    const path = [...parents, node];
    const children = visibleChildren(node);
    if (!children.length) {
      const levels = Array(5).fill("");
      path.slice(0, 5).forEach((item, index) => { levels[index] = item.label; });
      rows.push([...levels, path[0]?.external || "", path[0]?.banner || ""]);
      return;
    }
    children.forEach((child) => visit(child, path));
  }

  tree.forEach((node) => visit(node));
  return rows;
}

function hierarchyMerges(rows) {
  const merges = [{ s: { r: 1, c: 1 }, e: { r: 1, c: 7 } }];
  for (let column = 0; column < 5; column += 1) {
    let start = 0;
    while (start < rows.length) {
      const label = rows[start][column];
      let end = start + 1;
      while (label && end < rows.length && rows[end][column] === label && rows[end].slice(0, column + 1).every((value, index) => value === rows[start][index])) end += 1;
      if (label && end - start > 1) merges.push({ s: { r: start + 3, c: column + 1 }, e: { r: end + 2, c: column + 1 } });
      start = end;
    }
  }
  return merges;
}

function exportIA() {
  if (!window.XLSX) {
    showToast("Excel export is unavailable. Reload the page and try again.");
    return;
  }

  const rows = exportRows();
  const headers = ["1D", "2D", "3D", "4D", "5D", "External", "Banners"];
  const sheet = XLSX.utils.aoa_to_sheet([
    Array(8).fill(""),
    ["", state.country, "", "", "", "", "", ""],
    ["", ...headers],
    ...rows.map((row) => ["", ...row]),
  ]);
  sheet["!merges"] = hierarchyMerges(rows);
  sheet["!cols"] = [{ wch: 5.9 }, { wch: 16.9 }, { wch: 22 }, { wch: 28 }, { wch: 26 }, { wch: 19.9 }, { wch: 18 }, { wch: 27.4 }];
  sheet["!rows"] = [{ hpt: 15 }, { hpt: 24 }, { hpt: 21 }];

  const titleStyle = { font: { name: "Malgun Gothic", sz: 16, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
  const headerStyle = { font: { name: "Malgun Gothic", sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
  sheet.B2.s = titleStyle;
  headers.forEach((_, index) => { sheet[XLSX.utils.encode_cell({ r: 2, c: index + 1 })].s = headerStyle; });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Global");
  XLSX.writeFile(workbook, `lg-${slug(state.country)}-global-ia-${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`${state.country} IA exported as Excel.`);
}

let toastTimer;
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2600);
}

async function showStudio() {
  ui.loginScreen.classList.add("hidden");
  ui.studio.classList.remove("hidden");
  await switchCountry(state.country, { force: true });
}

function handleAction(action, id) {
  if (action === "toggle-node") toggleNode(id);
  if (action === "toggle-expand") toggleExpand(id);
  if (action === "preview-root") {
    state.previewRootId = id;
    selectNode(id);
  }
  if (action === "preview-child") {
    state.activeChildId = id;
    renderPreview();
  }
  if (action === "expand-all") {
    state.expanded = new Set(allNodes().filter(({ node }) => node.children.length).map(({ node }) => node.id));
    renderTree();
  }
  if (action === "collapse-all") {
    state.expanded = new Set();
    renderTree();
  }
  if (action === "save") saveChanges();
  if (action === "reset") resetTree();
  if (action === "export") exportIA();
  if (action === "confirm-country-switch" && state.pendingCountry) switchCountry(state.pendingCountry);
  if (action === "cancel-country-switch") {
    state.pendingCountry = null;
    ui.countryConfirm.classList.add("hidden");
    ui.countrySelect.focus();
  }
  if (action === "logout") {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    state.authToken = "";
    ui.studio.classList.add("hidden");
    ui.loginScreen.classList.remove("hidden");
    ui.passwordInput.value = "";
    ui.passwordInput.focus();
  }
}

async function authenticatePassword(password) {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  try {
    const response = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();
    return { authenticated: result.authenticated === true, token: result.token || "" };
  } catch {
    return { authenticated: isLocal && password === LOCAL_DEVELOPMENT_PASSWORD, token: "" };
  }
}

ui.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = ui.loginForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Checking…";
  const authentication = await authenticatePassword(ui.passwordInput.value);
  submitButton.disabled = false;
  submitButton.innerHTML = "Enter studio <span aria-hidden='true'>→</span>";
  if (authentication.authenticated) {
    sessionStorage.setItem(AUTH_KEY, "1");
    state.authToken = authentication.token;
    if (state.authToken) sessionStorage.setItem(AUTH_TOKEN_KEY, state.authToken);
    ui.loginError.textContent = "";
    showStudio();
  } else {
    ui.loginError.textContent = "That password does not match this internal workspace.";
    ui.passwordInput.select();
  }
});

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    handleAction(actionButton.dataset.action, actionButton.dataset.id);
    return;
  }
  const treeRow = event.target.closest(".tree-row");
  if (treeRow && !event.target.closest("button")) selectNode(treeRow.dataset.id);
});

document.addEventListener("input", (event) => {
  if (event.target === ui.treeSearch) {
    state.search = event.target.value.trim();
    renderTree();
  }
});

ui.countrySelect.addEventListener("change", (event) => requestCountrySwitch(event.target.value));

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== ui.treeSearch && document.activeElement !== ui.passwordInput) {
    event.preventDefault();
    ui.treeSearch.focus();
  }
});

ui.tree.addEventListener("dragstart", (event) => {
  const row = event.target.closest(".tree-row");
  if (!row || event.target.closest("button")) {
    event.preventDefault();
    return;
  }
  state.dragId = row.dataset.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.dragId);
});

ui.tree.addEventListener("dragover", (event) => {
  const row = event.target.closest(".tree-row");
  if (!row || !state.dragId || row.dataset.id === state.dragId) return;
  const source = findNode(state.dragId);
  const target = findNode(row.dataset.id);
  if (!source || !target || isDescendant(target.node, source.node)) return;
  event.preventDefault();
  const bounds = row.getBoundingClientRect();
  const rightSideNest = event.clientX > bounds.left + Math.min(90, bounds.width * .68);
  const verticalMode = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  state.dropMode = rightSideNest ? "inside" : verticalMode;
  row.classList.toggle("drop-nest", state.dropMode === "inside");
  row.classList.toggle("drop-before", state.dropMode === "before");
  row.classList.toggle("drop-after", state.dropMode === "after");
});

ui.tree.addEventListener("dragleave", (event) => {
  const row = event.target.closest(".tree-row");
  if (row && !row.contains(event.relatedTarget)) row.classList.remove("drop-nest", "drop-before", "drop-after");
});

ui.tree.addEventListener("drop", (event) => {
  const row = event.target.closest(".tree-row");
  if (!row || !state.dragId) return;
  event.preventDefault();
  const mode = state.dropMode || "before";
  row.classList.remove("drop-nest", "drop-before", "drop-after");
  moveNode(state.dragId, row.dataset.id, mode);
  state.dragId = null;
  state.dropMode = null;
});

ui.tree.addEventListener("dragend", () => {
  state.dragId = null;
  state.dropMode = null;
  ui.tree.querySelectorAll(".drop-nest, .drop-before, .drop-after").forEach((row) => row.classList.remove("drop-nest", "drop-before", "drop-after"));
});

document.querySelector("[data-action='reveal-password']").addEventListener("click", (event) => {
  const visible = ui.passwordInput.type === "text";
  ui.passwordInput.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "Show" : "Hide";
  event.currentTarget.setAttribute("aria-label", visible ? "Show password" : "Hide password");
});

if (sessionStorage.getItem(AUTH_KEY) === "1" && state.authToken) showStudio();
else {
  sessionStorage.removeItem(AUTH_KEY);
  ui.passwordInput.focus();
}
