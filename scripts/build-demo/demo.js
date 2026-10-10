"use strict";
// Static demo of Synaptane (synaptane.com/demo/app/): loaded before the application's
// preferences.js. Generated pages, no server: nothing here sends a request.
//  - theme: the site's choice (Starlight's "starlight-theme" key) applies to the demo, and back;
//  - forms: every action is disabled; a submission or a click on a disabled control shows the
//    banner's message instead;
//  - search: limited to the frozen queries (the palette needs a server, Ctrl+K opens the page).
(() => {
  const root = document.documentElement;
  const appKey = "synaptane.ui.v1.demo.theme";
  const siteKey = "starlight-theme";
  try {
    if (!localStorage.getItem(appKey)) {
      const site = localStorage.getItem(siteKey);
      if (site === "light" || site === "dark") localStorage.setItem(appKey, site);
    }
  } catch { /* No storage: the system theme. */ }

  const searchPage = () => {
    const form = document.querySelector("[data-demo-search]");
    if (form) return form.getAttribute("action");
    return (root.lang === "fr" ? "/fr/demo/app" : "/demo/app") + "/search/";
  };

  let timer = 0;
  const flash = message => {
    const banner = document.querySelector(".demo-banner");
    const status = banner?.querySelector(".demo-banner-flash");
    if (!banner || !status) return;
    status.textContent = message || banner.dataset.flash;
    banner.classList.add("demo-banner-flashing");
    clearTimeout(timer);
    timer = setTimeout(() => {
      banner.classList.remove("demo-banner-flashing");
      status.textContent = "";
    }, 4000);
  };

  // Submissions: search goes to a frozen result page; everything else stops here.
  window.addEventListener("submit", event => {
    const form = event.target;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-demo-search")) {
      flash();
      return;
    }
    let queries = {};
    try { queries = JSON.parse(form.dataset.demoQueries || "{}"); } catch { /* none */ }
    const asked = (form.elements.q?.value || "").trim().toLowerCase();
    if (queries[asked]) { window.location.assign(queries[asked]); return; }
    if (!form.dataset.demoQueries) { window.location.assign(searchPage()); return; }
    const note = document.querySelector("[data-demo-search-note]");
    const text = note?.querySelector("[data-demo-search-text]");
    if (note && text && note.dataset.miss) {
      text.textContent = note.dataset.miss;
      note.classList.add("demo-search-miss");
      note.querySelector("a")?.focus();
    }
  }, true);

  // A press on a disabled control (or its form) explains why nothing happens.
  document.addEventListener("pointerdown", event => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest("[aria-disabled=true], form[data-demo-off] label");
    if (control && !control.closest(".demo-banner")) flash();
  }, true);

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-theme-option]") : null;
    if (!button) return;
    const value = button.dataset.themeOption;
    try {
      if (value === "light" || value === "dark") localStorage.setItem(siteKey, value);
      else localStorage.removeItem(siteKey);
    } catch { /* No storage. */ }
  });

  // Ctrl/Cmd+K and "/": the search page (the live palette needs the server).
  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.isComposing || event.altKey) return;
    const typing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]");
    const shortcut = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);
    if (shortcut || (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey)) {
      event.preventDefault();
      const field = document.querySelector("[data-demo-search] input[name=q]");
      if (field) { field.focus(); field.select(); } else window.location.assign(searchPage());
    }
  });
})();
