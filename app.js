// Vardagsmaten v1
// Hela appen är en enda sida. Adressens slut (#) avgör vad som visas:
//   (inget)            -> receptlistan
//   #<id>              -> ett recept, t.ex. #palak-paneer
// Recepten ligger som JSON-filer i mappen "recept/". Listan över vilka som finns står i recept/index.json.

const app = document.getElementById("app");
let recipes = []; // alla recept, laddas en gång vid start

// ---------- Hjälpfunktioner ----------

// Skyddar mot att text i ett recept tolkas som HTML-kod
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// localStorage kan saknas (t.ex. privat läge), så vi gör aldrig så att appen kraschar av det
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// ---------- Mått och portioner ----------

// Snygga bråk: 0,5 -> ½
const FR = { 0.25: "¼", 0.5: "½", 0.75: "¾", 0.33: "⅓", 0.67: "⅔" };
function nice(x) {
  const w = Math.floor(x), f = Math.round((x - w) * 100) / 100;
  if (f === 0) return String(w);
  const key = Object.keys(FR).find(k => Math.abs(k - f) < 0.05);
  if (key) return (w ? w + " " : "") + FR[key];
  return x.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
}

// Svensk volymstege: krm 1 ml, tsk 5 ml, msk 15 ml, dl 100 ml.
// När man ökar portionerna byter vi till större mått (t.ex. 8 msk -> 1 ¼ dl).
const ML = { krm: 1, tsk: 5, msk: 15, dl: 100 };
function fmt(q, u) {
  if (q == null || q === "") return u || "";
  if (u === "g") return q >= 1000 ? nice(Math.round(q / 100) / 10) + " kg" : Math.max(5, Math.round(q / 5) * 5) + " g";
  if (u === "kg") return fmt(q * 1000, "g");
  if (ML[u]) {
    const ml = q * ML[u];
    if (ml >= 100 && u !== "krm") return nice(Math.round(ml / 100 * 4) / 4) + " dl";
    if (ml >= 15 && u !== "krm") return nice(Math.round(ml / 15 * 2) / 2) + " msk";
    if (ml >= 5) return nice(Math.round(ml / 5 * 2) / 2) + " tsk";
    return nice(Math.max(0.5, Math.round(ml * 2) / 2)) + " krm";
  }
  return nice(Math.round(q * 2) / 2) + (u ? " " + u : "");
}

// ---------- Ladda recept ----------

async function loadRecipes() {
  const ids = await fetch("recept/index.json", { cache: "no-cache" }).then(r => r.json());
  const all = await Promise.all(ids.map(id =>
    fetch(`recept/${id}.json`, { cache: "no-cache" }).then(r => r.json()).catch(() => null)
  ));
  // Nyast först
  recipes = all.filter(Boolean).sort((a, b) => String(b.tillagd).localeCompare(String(a.tillagd)));
}

// Bild: eget foto (sparat i telefonen) går före receptets bild
function imageFor(r) { return store.get("foto:" + r.id) || r.bild || ""; }
function imgHtml(r, cls) {
  const src = imageFor(r);
  if (src) return `<img class="${cls}" src="${esc(src)}" alt="">`;
  return `<div class="${cls} ph" aria-hidden="true">${esc(r.titel.charAt(0))}</div>`;
}

// ---------- Vy: receptlistan ----------

function renderList() {
  stopCooking();
  app.innerHTML = `
    <div class="top"><h1 class="brand">Vardagsmaten</h1></div>
    <input class="search" id="q" type="search" placeholder="Sök recept eller råvara" aria-label="Sök recept">
    <div class="list" id="list"></div>`;
  const q = document.getElementById("q");
  q.value = store.get("sok") || "";
  const draw = () => {
    store.set("sok", q.value);
    const term = q.value.trim().toLowerCase();
    const hits = recipes.filter(r =>
      !term ||
      r.titel.toLowerCase().includes(term) ||
      (r.ingredienser || []).some(i => i.namn.toLowerCase().includes(term)) ||
      (r.taggar || []).some(t => t.toLowerCase().includes(term))
    );
    document.getElementById("list").innerHTML = hits.length
      ? hits.map(r => `
        <a class="item" href="#${encodeURIComponent(r.id)}" style="text-decoration:none;color:inherit">
          ${imgHtml(r, "thumb")}
          <div>
            <h2>${esc(r.titel)}</h2>
            <div class="sub">${[r.tid, r.kalla?.namn].filter(Boolean).map(esc).join(" · ")}</div>
          </div>
        </a>`).join("")
      : `<p class="empty">${recipes.length ? "Inga recept matchar sökningen." : "Inga recept än."}</p>`;
  };
  q.addEventListener("input", draw);
  draw();
}

// ---------- Vy: ett recept ----------

let current = null;   // receptet som visas
let portions = 4;
let stepIdx = -1;     // vilket steg som är markerat i matlagningsläget

function renderRecipe(id) {
  const r = recipes.find(x => x.id === id);
  if (!r) { location.hash = ""; return; }
  current = r;
  portions = Number(store.get("portioner:" + r.id)) || r.portioner || 4;
  stepIdx = -1;
  const hasGuess = (r.ingredienser || []).some(i => i.gissning) || (r.steg || []).some(s => s.gissning) || r.gissningar;

  app.innerHTML = `
    <div class="top"><button class="back" id="back">‹ Alla recept</button></div>
    <div class="herobox">
      ${imgHtml(r, "hero")}
      <button class="photo-btn" id="photoBtn">📷 Byt bild</button>
      <input type="file" accept="image/*" id="photoIn" hidden>
    </div>
    <h1>${esc(r.titel)}</h1>
    <div class="meta">
      ${r.tid ? `<span class="chip">⏱ ${esc(r.tid)}</span>` : ""}
      ${(r.taggar || []).map(t => `<span class="chip">${esc(t)}</span>`).join("")}
    </div>
    ${r.kalla?.url ? `<div class="source">Original: <a href="${esc(r.kalla.url)}" target="_blank" rel="noopener">${esc(r.kalla.namn || "länk")}</a></div>` : ""}
    ${hasGuess ? `<div class="guessnote">Märkt <b>gissning</b> = fanns inte i originalet, Claude har uppskattat. ${esc(r.gissningar || "")}</div>` : ""}

    <div class="panel">
      <label class="cook">
        <input type="checkbox" id="cookmode">
        <span class="switch" aria-hidden="true"></span>
        Matlagningsläge
      </label>
      <div class="status" id="cookstatus">Håller skärmen tänd medan du lagar mat.</div>
      <div id="cooktools" hidden>
        <div class="row">
          <button class="btn ghost" id="prev">‹ Förra steget</button>
          <button class="btn" id="next">Nästa steg ›</button>
        </div>
        <p class="status" style="margin:10px 0 0">
          <button class="btn ghost" id="voice" aria-pressed="false">🎤 Röststyrning</button>
        </p>
        <p class="status" id="voicestatus" style="margin:6px 0 0">Säg "nästa", "förra" eller "läs upp".</p>
      </div>
    </div>

    <div class="panel">
      <div class="row">
        <h2 class="sec">Ingredienser</h2>
        <div class="portions" role="group" aria-label="Antal portioner">
          <button id="minus" aria-label="Färre portioner">−</button>
          <output id="pcount"></output>
          <button id="plus" aria-label="Fler portioner">+</button>
        </div>
      </div>
      <ul class="ing" id="ing"></ul>
      <button class="btn ghost" id="copy">📋 Kopiera inköpslista</button>
      ${r.tips ? `<div class="tip">Tips: ${esc(r.tips)}</div>` : ""}
    </div>

    <div class="panel">
      <h2 class="sec">Gör så här</h2>
      <ol class="steps" id="steps"></ol>
    </div>

    <p class="note">Tryck på en ingrediens eller ett steg för att bocka av det.${r.tillagd ? " Sparat " + esc(r.tillagd) + "." : ""}</p>`;

  document.getElementById("back").onclick = () => { location.hash = ""; };
  document.getElementById("minus").onclick = () => setPortions(portions - 2);
  document.getElementById("plus").onclick = () => setPortions(portions + 2);
  document.getElementById("copy").onclick = copyList;
  setupPhoto(r);
  setupCooking();
  drawIngredients();
  drawSteps();
  window.scrollTo(0, 0);
}

function setPortions(p) {
  portions = Math.max(1, Math.min(40, p));
  store.set("portioner:" + current.id, portions);
  drawIngredients();
}

function scaled(i) {
  const base = current.portioner || 4;
  return fmt(i.mangd == null ? null : i.mangd * portions / base, i.enhet);
}

const checked = new Set();
function drawIngredients() {
  document.getElementById("pcount").textContent = portions + " portioner";
  const ul = document.getElementById("ing");
  ul.innerHTML = "";
  (current.ingredienser || []).forEach((it, n) => {
    const key = current.id + ":i" + n;
    const li = document.createElement("li");
    li.tabIndex = 0;
    if (checked.has(key)) li.classList.add("checked");
    li.innerHTML = `<span class="amt">${esc(scaled(it))}</span><span>${esc(it.namn)}${it.gissning ? '<span class="guess">gissning</span>' : ""}</span>`;
    const toggle = () => { checked.has(key) ? checked.delete(key) : checked.add(key); li.classList.toggle("checked"); };
    li.onclick = toggle;
    li.onkeydown = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } };
    ul.appendChild(li);
  });
}

function drawSteps() {
  const ol = document.getElementById("steps");
  ol.innerHTML = "";
  (current.steg || []).forEach((s, n) => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.innerHTML = `<div>${esc(s.text)}${s.tid ? ` <span class="timer">⏱ ${esc(s.tid)}</span>` : ""}${s.gissning ? '<span class="guess">gissning</span>' : ""}</div>`;
    const toggle = () => li.classList.toggle("checked");
    li.onclick = toggle;
    li.onkeydown = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } };
    ol.appendChild(li);
  });
}

// "Kopiera inköpslista": en rad per vara, i rätt mängd för valt antal portioner.
// Klistra sedan in i ICA-appens inköpslista.
async function copyList() {
  const lines = (current.ingredienser || [])
    .filter((it, n) => !checked.has(current.id + ":i" + n)) // det du bockat av har du redan hemma
    .map(it => `${scaled(it)} ${it.namn}`.trim());
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast(`Kopierade ${lines.length} varor. Klistra in i ICA-appen.`);
  } catch {
    // Om kopiering inte tillåts: visa listan så att man kan markera och kopiera själv
    const ta = document.createElement("textarea");
    ta.value = text; ta.rows = lines.length; ta.className = "search";
    document.getElementById("copy").after(ta);
    ta.select();
    toast("Markera listan och kopiera.");
  }
}

// Eget foto: förminskas och sparas i telefonen (syns bara på den här enheten i v1)
function setupPhoto(r) {
  const btn = document.getElementById("photoBtn"), input = document.getElementById("photoIn");
  btn.onclick = () => input.click();
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const max = 900, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      if (store.set("foto:" + r.id, c.toDataURL("image/jpeg", 0.8))) { toast("Bilden är sparad på den här enheten."); renderRecipe(r.id); }
      else toast("Kunde inte spara bilden.");
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };
}

// ---------- Matlagningsläge: skärmen hålls tänd (Wake Lock) ----------

let lock = null, cooking = false;

async function lockOn() {
  const st = document.getElementById("cookstatus");
  try {
    if (!("wakeLock" in navigator)) throw new Error("stöds inte");
    lock = await navigator.wakeLock.request("screen");
    if (st) st.textContent = "Skärmen hålls tänd.";
  } catch {
    if (st) st.textContent = "Kunde inte hålla skärmen tänd här. Öppna appen från hemskärmen (kräver iOS 18.4 eller senare).";
  }
}

function setupCooking() {
  const cb = document.getElementById("cookmode"), tools = document.getElementById("cooktools");
  cb.onchange = () => {
    cooking = cb.checked;
    tools.hidden = !cooking;
    if (cooking) { lockOn(); if (stepIdx < 0) goStep(0, false); }
    else stopCooking(true);
  };
  document.getElementById("next").onclick = () => goStep(stepIdx + 1, false);
  document.getElementById("prev").onclick = () => goStep(stepIdx - 1, false);
  document.getElementById("voice").onclick = toggleVoice;
}

// Telefonen släpper låset när man byter app. Vi tar det igen när man kommer tillbaka.
document.addEventListener("visibilitychange", () => {
  if (cooking && document.visibilityState === "visible") lockOn();
});

function stopCooking(keepView) {
  cooking = false;
  if (lock) { lock.release().catch(() => {}); lock = null; }
  stopVoice();
  if (keepView) {
    const st = document.getElementById("cookstatus");
    if (st) st.textContent = "Håller skärmen tänd medan du lagar mat.";
    document.querySelectorAll("ol.steps li.current").forEach(li => li.classList.remove("current"));
    stepIdx = -1;
  }
}

function goStep(n, speak) {
  const items = document.querySelectorAll("ol.steps li");
  if (!items.length) return;
  n = Math.max(0, Math.min(items.length - 1, n));
  if (stepIdx >= 0 && n > stepIdx) items[stepIdx].classList.add("checked");
  stepIdx = n;
  items.forEach((li, i) => li.classList.toggle("current", i === n));
  items[n].scrollIntoView({ behavior: "smooth", block: "center" });
  if (speak) say(`Steg ${n + 1}. ${current.steg[n].text}`);
}

// ---------- Röst: styr stegen med rösten och få dem upplästa ----------

let rec = null, listening = false;

function say(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "sv-SE";
  speechSynthesis.speak(u);
}

function toggleVoice() { listening ? stopVoice() : startVoice(); }

function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const vs = document.getElementById("voicestatus"), btn = document.getElementById("voice");
  if (!SR) { vs.textContent = "Röststyrning stöds inte i den här webbläsaren."; return; }
  rec = new SR();
  rec.lang = "sv-SE";
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = e => {
    const heard = e.results[e.results.length - 1][0].transcript.toLowerCase();
    vs.textContent = `Hörde: "${heard}"`;
    if (/nästa|fortsätt|klar/.test(heard)) goStep(stepIdx + 1, true);
    else if (/förra|tillbaka|bakåt/.test(heard)) goStep(stepIdx - 1, true);
    else if (/läs|igen|upprepa/.test(heard)) goStep(stepIdx, true);
    else if (/ingrediens/.test(heard)) say((current.ingredienser || []).map(i => `${scaled(i)} ${i.namn}`).join(". "));
  };
  // Safari stänger av lyssnandet efter en stund. Starta igen så länge knappen är på.
  rec.onend = () => { if (listening) { try { rec.start(); } catch {} } };
  rec.onerror = e => { if (e.error === "not-allowed") { vs.textContent = "Ge appen tillgång till mikrofonen för att använda röst."; stopVoice(); } };
  try { rec.start(); listening = true; btn.setAttribute("aria-pressed", "true"); vs.textContent = 'Lyssnar. Säg "nästa", "förra", "läs upp" eller "ingredienser".'; }
  catch { vs.textContent = "Kunde inte starta mikrofonen."; }
}

function stopVoice() {
  listening = false;
  if (rec) { try { rec.stop(); } catch {} rec = null; }
  const btn = document.getElementById("voice");
  if (btn) btn.setAttribute("aria-pressed", "false");
}

// ---------- Start ----------

function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) renderRecipe(id);
  else renderList();
}

window.addEventListener("hashchange", route);
loadRecipes()
  .then(route)
  .catch(() => { app.innerHTML = `<p class="empty">Kunde inte ladda recepten. Kontrollera nätet och försök igen.</p>`; });
