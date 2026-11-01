"use strict";
const TOPICS = [
  "Czechia",
  "World",
  "Politics",
  "Business",
  "Economics",
  "Science",
  "Climate",
  "Sports",
];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) =>
  String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const fold = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const bookmarkIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
let data = { stories: [], feeds: [] },
  category = "All",
  view = "news",
  limit = 12,
  readerId = null;
let readerOpener = null,
  readerArticle = null;
function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
const saved = new Set(stored("brief-saved", []));
let archives = stored("brief-archives", {});
function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function age(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time unavailable";
  const minutes = Math.max(0, (Date.now() - Date.parse(value)) / 60000);
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? Math.floor(minutes) + "m ago"
      : minutes < 1440
        ? Math.floor(minutes / 60) + "h ago"
        : Math.floor(minutes / 1440) + "d ago";
}
function meta(article) {
  return (
    '<span class="source">' +
    esc(article.source) +
    "</span><span>·</span><time" +
    (article.published
      ? ' datetime="' +
        esc(article.published) +
        '" title="' +
        esc(new Date(article.published).toLocaleString()) +
        '"'
      : "") +
    ">" +
    age(article.published) +
    "</time>"
  );
}
function language(article) {
  return article.language === "cs" ? "cs" : "en";
}
function balanceTopics(stories) {
  const groups = TOPICS.map((topic) =>
    stories.filter((a) => a.category === topic),
  );
  const output = [];
  for (let index = 0; groups.some((group) => group.length > index); index++) {
    for (const group of groups) if (group[index]) output.push(group[index]);
  }
  return output.concat(stories.filter((a) => !TOPICS.includes(a.category)));
}
function allStories() {
  if (view === "saved")
    return Object.values(archives)
      .filter((a) => a && saved.has(a.id))
      .sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  return category === "All" && !$("#search").value.trim()
    ? balanceTopics(data.stories)
    : data.stories;
}
function picture(article) {
  return article.image
    ? '<img class="photo" loading="lazy" decoding="async" src="' +
        esc(article.image) +
        '" alt="" referrerpolicy="no-referrer">'
    : "";
}
function storyCard(article) {
  const selected = saved.has(article.id);
  return (
    '<article class="story"><div class="story-heading"><div><div class="category">' +
    esc(article.category) +
    '</div><h2 lang="' +
    language(article) +
    '"><button class="headline" data-open="' +
    esc(article.id) +
    '">' +
    esc(article.title) +
    "</button></h2></div>" +
    picture(article) +
    '</div><p class="summary" lang="' +
    language(article) +
    '">' +
    esc(article.summary || "Read the full article at the source.") +
    '</p><div class="story-footer"><div class="meta">' +
    meta(article) +
    '</div><div class="story-actions"><button class="read" data-open="' +
    esc(article.id) +
    '">Read more ↗</button><button class="bookmark ' +
    (selected ? "selected" : "") +
    '" data-save="' +
    esc(article.id) +
    '" aria-label="' +
    (selected ? "Unsave" : "Save") +
    ": " +
    esc(article.title) +
    '" aria-pressed="' +
    selected +
    '">' +
    bookmarkIcon +
    "</button></div></div></article>"
  );
}
function navigationState() {
  $$(".topics [data-category]").forEach((button) => {
    const active = view !== "saved" && category === button.dataset.category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const activeView =
    view === "saved"
      ? "saved"
      : category === "Czechia"
        ? "czech"
        : "news";
  $$(".bottom-nav [data-view]").forEach((button) => {
    const active = button.dataset.view === activeView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#saved").setAttribute("aria-pressed", String(view === "saved"));
}
function render() {
  const query = fold($("#search").value);
  const items = allStories().filter(
    (a) =>
      (category === "All" || a.category === category) &&
      (!query ||
        fold(
          a.title + " " + a.detail + " " + a.source + " " + a.category,
        ).includes(query)),
  );
  $("#clear-search").hidden = !query;
  $("#savedcount").textContent = saved.size;
  $("#mobile-savedcount").textContent = saved.size
    ? "(" + saved.size + ")"
    : "";
  $("#sectiontitle").textContent =
    view === "saved"
      ? "Saved"
      : query
        ? "Search"
        : category === "All"
          ? "News"
          : category;
  $("#storycount").textContent =
    items.length + (items.length === 1 ? " story" : " stories");
  $("#stories").innerHTML = items.length
    ? items.slice(0, limit).map(storyCard).join("")
    : '<div class="empty">' +
      (view === "saved" ? "No saved stories." : "No stories found.") +
      "</div>";
  $("#more").hidden = items.length <= limit;
  navigationState();
  $$("#stories img").forEach((img) => {
    img.onerror = () => img.remove();
  });
}
function sources() {
  const names = [...new Set(data.feeds.map((feed) => feed.source))];
  $("#sources").innerHTML = names
    .map((name) => {
      const feeds = data.feeds.filter((feed) => feed.source === name),
        ok = feeds.some((feed) => feed.ok);
      return (
        '<div class="sourceitem"><span>' +
        esc(name) +
        '</span><span class="' +
        (ok ? "ok" : "") +
        '">' +
        (feeds.every((feed) => feed.ok)
          ? "Connected"
          : ok
            ? "Partial"
            : "Unavailable") +
        "</span></div>"
      );
    })
    .join("");
}
function findStory(id) {
  return (
    data.stories.find((a) => a.id === id) ||
    archives[id] ||
    (readerArticle?.id === id ? readerArticle : null)
  );
}
function updateReaderSave() {
  $("#reader-save").textContent = saved.has(readerId) ? "Saved ✓" : "Save";
  $("#reader-save").setAttribute("aria-pressed", String(saved.has(readerId)));
}
function toggleSave(id) {
  const article = findStory(id);
  if (!article) return;
  if (saved.has(id)) {
    saved.delete(id);
    delete archives[id];
  } else {
    saved.add(id);
    archives[id] = article;
  }
  persist("brief-saved", [...saved]);
  persist("brief-archives", archives);
  // Keep the active save button in place for keyboard and touch users.
  if (view === "saved") render();
  else {
    $$("[data-save]")
      .filter((button) => button.dataset.save === id)
      .forEach((button) => {
        button.classList.toggle("selected", saved.has(id));
        button.setAttribute("aria-pressed", String(saved.has(id)));
        button.setAttribute(
          "aria-label",
          (saved.has(id) ? "Unsave" : "Save") + ": " + article.title,
        );
      });
    $("#savedcount").textContent = saved.size;
    $("#mobile-savedcount").textContent = saved.size
      ? "(" + saved.size + ")"
      : "";
  }
  if (readerId) updateReaderSave();
}
function openStory(id, opener) {
  const article = findStory(id);
  if (!article) return;
  readerId = id;
  readerArticle = article;
  readerOpener = opener || document.activeElement;
  $("#readerbody").innerHTML =
    '<div class="category">' +
    esc(article.category) +
    '</div><h2 id="reader-title" lang="' +
    language(article) +
    '">' +
    esc(article.title) +
    '</h2><div class="meta">' +
    meta(article) +
    "</div>" +
    (article.image
      ? '<img src="' +
        esc(article.image) +
        '" alt="Image supplied by ' +
        esc(article.source) +
        '" referrerpolicy="no-referrer">'
      : "") +
    '<p class="bodytext" lang="' +
    language(article) +
    '">' +
    esc(article.detail || "No excerpt available.") +
    '</p><p class="note">Publisher excerpt · May require a subscription</p>';
  $("#reader-original").href = article.url;
  $("#reader-original").textContent = "Read at " + article.source + " ↗";
  updateReaderSave();
  $("#reader").showModal();
  $("#reader").scrollTop = 0;
  document.body.classList.add("reader-open");
  const img = $("#readerbody img");
  if (img) img.onerror = () => img.remove();
  history.pushState({ briefReader: true }, "");
}
function closeReader() {
  if (!$("#reader").open) return;
  $("#reader").close();
  if (history.state?.briefReader) history.back();
}
function navigate(destination) {
  $("#search").value = "";
  category = destination === "czech" ? "Czechia" : "All";
  view = destination === "saved" ? "saved" : "news";
  limit = 12;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  const activeTopic = $$(".topics [data-category]").find(
    (button) => button.dataset.category === category,
  );
  activeTopic?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function wireUI() {
  document.addEventListener("click", (event) => {
    const open = event.target.closest("[data-open]");
    if (open) openStory(open.dataset.open, open);
    const save = event.target.closest("[data-save]");
    if (save) toggleSave(save.dataset.save);
  });
  $$(".topics [data-category]").forEach(
    (button) =>
      (button.onclick = () => {
        category = button.dataset.category;
        view = "news";
        limit = 12;
        render();
        button.scrollIntoView({ block: "nearest", inline: "nearest" });
        // A topic selected after scrolling should start with its first report.
        if (category === "All")
          window.scrollTo({ top: 0, behavior: "instant" });
        else if (window.scrollY > $(".navigation").offsetTop)
          $("#all-news").scrollIntoView({ block: "start" });
      }),
  );
  $$(".bottom-nav [data-view]").forEach(
    (button) => (button.onclick = () => navigate(button.dataset.view)),
  );
  $("#saved").onclick = () => navigate(view === "saved" ? "news" : "saved");
  $("#search").oninput = () => {
    limit = 12;
    render();
  };
  $("#search").onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#search").blur();
      $("#all-news").scrollIntoView({ block: "start" });
    }
  };
  $("#clear-search").onclick = () => {
    $("#search").value = "";
    limit = 12;
    render();
    $("#search").focus();
  };
  $("#more").onclick = () => {
    const count = $$("#stories .story").length;
    limit += 12;
    render();
    $$("#stories .story .headline")[count]?.focus({ preventScroll: true });
  };
  $("#reader-save").onclick = () => toggleSave(readerId);
  $("#close-reader").onclick = closeReader;
  $("#reader").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReader();
  });
  $("#reader").addEventListener("close", () => {
    readerId = null;
    readerArticle = null;
    document.body.classList.remove("reader-open");
    if (readerOpener?.isConnected) readerOpener.focus({ preventScroll: true });
    readerOpener = null;
  });
  $("#reader").addEventListener("click", (event) => {
    if (event.target !== $("#reader")) return;
    const rect = event.target.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeReader();
  });
  window.addEventListener("popstate", () => {
    if ($("#reader").open && !history.state?.briefReader) $("#reader").close();
  });
  $("#refresh").onclick = load;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$("#reader").open) load();
  });
}
function displaySnapshot() {
  $("#updated").textContent =
    "Updated " +
    new Date(data.updated).toLocaleString("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  render();
  sources();
}
let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  const button = $("#refresh");
  button.disabled = true;
  button.classList.add("busy");
  try {
    const response = await fetch("./news.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("News unavailable");
    const next = await response.json();
    if (!Array.isArray(next.stories) || !next.stories.length)
      throw new Error("No reports");
    data = next;
    persist("brief-cache", data);
    displaySnapshot();
    $("#notice").textContent = data.feeds.some((feed) => !feed.ok)
      ? "Some feeds are unavailable."
      : "";
  } catch {
    if (data.stories.length)
      $("#notice").textContent =
        "Offline · Showing news from " +
        new Date(data.updated).toLocaleString("en-GB") +
        ".";
    else {
      $("#notice").textContent = "Couldn’t load news. Try refreshing.";
      render();
    }
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
    loading = false;
  }
}
function init() {
  // A reloaded page has no open reader, even if its previous history entry did.
  if (history.state?.briefReader) history.replaceState(null, "");
  $("#today").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  wireUI();
  const cached = stored("brief-cache", null);
  if (cached?.stories?.length && Array.isArray(cached.feeds)) {
    data = cached;
    displaySnapshot();
  }
  load();
  setInterval(() => {
    if (!document.hidden && !$("#reader").open) load();
  }, 600000);
}
init();
