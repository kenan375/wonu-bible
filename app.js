/* 원어서재 — 개인용 원어 대조 성경
   원어 데이터: STEPBible.org (Tyndale House, Cambridge) CC BY 4.0
   한글 본문: 사용자가 자기 기기에서 불러온 파일 (기기 밖으로 나가지 않음) */
"use strict";

// ---------- 성경 목록 ----------
const BOOKS = [
 ["창세기","창",50],["출애굽기","출",40],["레위기","레",27],["민수기","민",36],["신명기","신",34],["여호수아","수",24],["사사기","삿",21],["룻기","룻",4],
 ["사무엘상","삼상",31],["사무엘하","삼하",24],["열왕기상","왕상",22],["열왕기하","왕하",25],["역대상","대상",29],["역대하","대하",36],["에스라","스",10],["느헤미야","느",13],
 ["에스더","에",10],["욥기","욥",42],["시편","시",150],["잠언","잠",31],["전도서","전",12],["아가","아",8],["이사야","사",66],["예레미야","렘",52],["예레미야애가","애",5],
 ["에스겔","겔",48],["다니엘","단",12],["호세아","호",14],["요엘","욜",3],["아모스","암",9],["오바댜","옵",1],["요나","욘",4],["미가","미",7],["나훔","나",3],["하박국","합",3],
 ["스바냐","습",3],["학개","학",2],["스가랴","슥",14],["말라기","말",4],
 ["마태복음","마",28],["마가복음","막",16],["누가복음","눅",24],["요한복음","요",21],["사도행전","행",28],["로마서","롬",16],["고린도전서","고전",16],["고린도후서","고후",13],
 ["갈라디아서","갈",6],["에베소서","엡",6],["빌립보서","빌",4],["골로새서","골",4],["데살로니가전서","살전",5],["데살로니가후서","살후",3],["디모데전서","딤전",6],["디모데후서","딤후",4],
 ["디도서","딛",3],["빌레몬서","몬",1],["히브리서","히",13],["야고보서","약",5],["베드로전서","벧전",5],["베드로후서","벧후",3],["요한일서","요일",5],["요한이서","요이",1],
 ["요한삼서","요삼",1],["유다서","유",1],["요한계시록","계",22]
];
const isOT = b => b <= 39;
const refStr = (b, c, v) => `${BOOKS[b-1][1]} ${c}${v ? ":" + v : ""}`;
const refKey = (b, c, v) => b * 1000000 + c * 1000 + v;
const fromKey = k => [Math.floor(k / 1000000), Math.floor(k / 1000) % 1000, k % 1000];

// ---------- 작은 도구 ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("wb." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("wb." + k, JSON.stringify(v)); } catch {} }
};
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600);
}

// ---------- IndexedDB (한글 본문, 노트) ----------
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("wonu-bible", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("kor"); d.createObjectStore("notes"); d.createObjectStore("meta"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (name, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(name, mode); const s = t.objectStore(name);
      let out; const r = fn(s); if (r) r.onsuccess = () => out = r.result;
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (n, k) => tx(n, "readonly", s => s.get(k)),
    put: (n, k, v) => tx(n, "readwrite", s => s.put(v, k)),
    del: (n, k) => tx(n, "readwrite", s => s.delete(k)),
    clear: n => tx(n, "readwrite", s => s.clear()),
    all: async n => {
      const d = await open();
      return new Promise((res, rej) => {
        const out = []; const t = d.transaction(n, "readonly"); const r = t.objectStore(n).openCursor();
        r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, c.value]); c.continue(); } };
        t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
      });
    }
  };
})();

// ---------- 데이터 불러오기 ----------
const cache = new Map();
async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path).then(r => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
  cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}
const loadBook = b => getJSON(`data/books/${String(b).padStart(2, "0")}.json`);
const loadLex = lang => getJSON(`data/lex/${lang}.json`);
const loadConc = lang => getJSON(`data/conc/${lang}.json`);
const loadMorph = () => getJSON("data/morph.json");
const korCache = new Map();
async function loadKor(b) {
  if (korCache.has(b)) return korCache.get(b);
  const v = (await idb.get("kor", b)) || null;
  korCache.set(b, v);
  return v;
}

// ---------- 상태 ----------
const state = {
  b: store.get("b", 1), c: store.get("c", 1),
  fs: store.get("fs", 20), gloss: store.get("gloss", false),
  allOrig: store.get("allOrig", false), allEn: store.get("allEn", false),
  theme: store.get("theme", "dark"), pad: store.get("pad", "home"),
  hasKor: false, notes: new Map(), marks: new Set(),
  list: [],          // 지금 화면에 보이는 절 [b,c,v]
  mode: "chapter",   // chapter | range | refs
  terms: [], words: []
};
const loadEn = b => getJSON(`data/en/${String(b).padStart(2, "0")}.json`);
const loadXref = b => getJSON(`data/xref/${String(b).padStart(2, "0")}.json`);
const korText = async (b, c, v) => { const k = await loadKor(b); return k && k[c] && k[c][v] ? k[c][v] : null; };

// 장의 절 수: 한글 → 원어 → 영어 순으로 확인
async function verseCount(b, c) {
  const k = await loadKor(b);
  if (k && k[c]) return Math.max(...Object.keys(k[c]).map(Number));
  try { const o = await loadBook(b); if (o[c]) return Math.max(...Object.keys(o[c]).map(Number)); } catch {}
  try { const e = await loadEn(b); if (e[c]) return Math.max(...Object.keys(e[c]).map(Number)); } catch {}
  return 0;
}
async function versesOf(b, c) {
  const n = await verseCount(b, c);
  return Array.from({ length: n }, (_, i) => [b, c, i + 1]);
}

// ---------- 목록 그리기 ----------
const hlRe = () => state.terms.length ? new RegExp(state.terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;

async function drawList(scrollKey) {
  const reader = $("#reader");
  if (state.pad === "plan") return showPlan();
  reader.className = (state.gloss ? "show-gloss " : "") + "pad-" + state.pad;
  state.words = [];
  const list = state.list;
  const multiBook = state.mode !== "ctx" && new Set(list.map(r => r[0])).size > 1;
  const books = [...new Set(list.map(r => r[0]))];
  const xrefs = {};
  await Promise.all(books.map(async b => { try { xrefs[b] = await loadXref(b); } catch { xrefs[b] = null; } }));
  const re = hlRe();
  let h = "";
  if (!state.hasKor) h += `<div class="notice"><b>개역개정 본문이 아직 없습니다.</b><span>설정(☰)에서 갖고 계신 성경 파일(.bdb)을 한 번 불러오면 한글 본문이 나옵니다. 파일은 이 휴대폰 안에만 저장됩니다. 그 전에는 영어(KJV)로 보여 드립니다.</span><div><button class="btn" type="button" data-act="settings">파일 불러오기</button></div></div>`;
  if (state.mode === "chapter") h += `<div class="headband"><span>${esc(BOOKS[state.b-1][0])} ${state.c}장</span><span>#</span></div>`;
  else h += `<div class="headband"><span>${list.length}절</span><span>#</span></div>`;
  if (state.pad === "kateta") h += `<div class="kateta-top">${commChips(curComm(), "pad")}<p class="small">영어 주석은 인터넷에서 불러옵니다(무료 공개 자료). 한 번 본 장은 휴대폰에 저장됩니다.</p></div>`;
  h += `<div class="list-wrap">`;
  let lastBook = 0;
  for (const [b, c, v] of list) {
    if (multiBook && b !== lastBook) { h += `<p class="group-h">${esc(BOOKS[b-1][0])}</p>`; lastBook = b; }
    const key = refKey(b, c, v);
    const k = await korText(b, c, v);
    let text = "", title = "";
    if (k) { text = k.x; title = k.t || ""; }
    else { try { const e = await loadEn(b); text = e[c] && e[c][v] || ""; } catch {} }
    let th = esc(text); if (re) th = th.replace(re, m => `<mark>${m}</mark>`);
    const xn = xrefs[b] && xrefs[b][c] && xrefs[b][c][v] ? xrefs[b][c][v].length : 0;
    const ot = isOT(b);
    const prefix = multiBook || state.mode !== "chapter" ? `${BOOKS[b-1][1]} ${c}:${v}` : `${c}:${v}`;
    h += `<article class="verse" id="r${key}" data-k="${key}">
      <div class="vrow"><div class="vtext">${title ? `<span class="ps-title">${esc(title)}</span>` : ""}<span class="vref">${prefix}</span>${th}${state.reasons && state.reasons.get(key) ? `<span class="why">${state.reasons.get(key).slice(0, 4).map(r => `<i>${esc(r)}</i>`).join("")}</span>` : ""}</div>
      <div class="vside"><span class="vnum">${v}</span><button class="enbtn" type="button" data-tool="en" data-k="${key}" aria-pressed="false" aria-label="영어 성경">EN</button></div></div>
      <div class="vtools">
        <button class="vt ${ot ? "he" : "gr"}" type="button" data-tool="orig" data-k="${key}" aria-pressed="false" aria-label="원어">${ot ? "א" : "α"}</button>
        ${ot ? `<button class="vt lx" type="button" data-tool="lxx" data-k="${key}" aria-pressed="false" aria-label="70인역">Λ</button>` : ""}
        <button class="vt xr" type="button" data-tool="xref" data-k="${key}" aria-pressed="false" aria-label="관주">🔗<small>${xn || ""}</small></button>
        <button class="vt cm" type="button" data-tool="comm" data-k="${key}" aria-pressed="false" aria-label="주석">주</button>
        <button class="vt nt${state.notes.has(key) ? " has" : ""}" type="button" data-tool="note" data-k="${key}" aria-label="노트">✎</button>
        <button class="vt nt${state.marks.has(key) ? " has" : ""}" type="button" data-tool="mark" data-k="${key}" aria-label="북마크">⚑</button>
        <button class="vt cp" type="button" data-tool="tts" data-k="${key}" aria-label="읽어주기">▶</button>
        <button class="vt cp" type="button" data-tool="copy" data-k="${key}" aria-label="복사">#</button>
      </div>
      ${state.pad === "inter" ? `<div class="inter">${await interHTML(b, c, v)}</div>` : ""}
      ${state.pad === "copy" ? copyHTML(key, text) : ""}
      ${state.pad === "kateta" ? `<div class="kateta">${await katetaHTML(b, c, v)}</div>` : ""}
      <div class="panels"></div></article>`;
  }
  h += `</div>`;
  if (state.mode === "chapter") h += `<nav class="chap-nav"><button type="button" data-act="prev">‹ 이전 장</button><button type="button" data-act="next">다음 장 ›</button></nav>`;
  reader.innerHTML = h;
  // 전체 펼침 설정 적용
  if (state.allOrig || state.allEn) {
    for (const el of reader.querySelectorAll(".verse")) {
      const key = +el.dataset.k;
      if (state.allOrig) await togglePanel(el, "orig", key, true);
      if (state.allEn && state.hasKor) await togglePanel(el, "en", key, true);
    }
  }
  if (scrollKey) {
    const el = document.getElementById("r" + scrollKey);
    if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center" }); setTimeout(() => el.classList.remove("hl"), 2500); }
  }
}

async function showChapter(b, c, v) {
  state.b = b; state.c = Math.min(Math.max(1, c), BOOKS[b-1][2]);
  state.mode = "chapter"; state.terms = []; state.reasons = null;
  store.set("b", state.b); store.set("c", state.c);
  try { history.replaceState(history.state, "", `#${state.b}-${state.c}`); } catch {}
  $("#locText").textContent = `${BOOKS[state.b-1][0]} ${state.c}`;
  document.title = `${refStr(state.b, state.c)} · 원어서재`;
  state.list = await versesOf(state.b, state.c);
  $("#info").textContent = "";
  syncRange(state.b, state.c, 0, state.b, state.c, 0);
  await drawList(v ? refKey(state.b, state.c, v) : 0);
  if (!v) $("#reader").scrollIntoView({ block: "start" });
}
function go(b, c, v) {
  sheetStack = []; hideSheet();
  if (state.pad === "plan") { state.pad = "home"; store.set("pad", "home"); $("#padName").textContent = PADS.home[1]; }
  showChapter(b, c, v);
}
function step(d) {
  let { b, c } = state; c += d;
  if (c < 1) { if (b === 1) return; b--; c = BOOKS[b-1][2]; }
  if (c > BOOKS[b-1][2]) { if (b === 66) return; b++; c = 1; }
  go(b, c);
}

// ---------- 절별 패널 ----------
async function togglePanel(article, tool, key, forceOpen) {
  const btn = article.querySelector(`[data-tool="${tool}"]`);
  const box = article.querySelector(".panels");
  const existing = box.querySelector(`[data-p="${tool}"]`);
  if (existing && !forceOpen) { existing.remove(); btn?.setAttribute("aria-pressed", "false"); return; }
  if (existing) return;
  const [b, c, v] = fromKey(key);
  const div = document.createElement("div");
  div.className = "panel"; div.dataset.p = tool;
  if (tool === "en") {
    let t = "";
    try { const e = await loadEn(b); t = e[c] && e[c][v] || ""; } catch {}
    div.innerHTML = `<h4>KJV</h4><div class="en-text">${esc(t) || "영어 본문이 없습니다."}</div>`;
  } else if (tool === "orig") {
    let ws = null;
    try { const o = await loadBook(b); ws = o[c] && o[c][v]; } catch {}
    if (!ws || !ws.length) div.innerHTML = `<p class="small">이 절은 원어 데이터의 장절 구분이 달라 원문이 연결되지 않았습니다.</p>`;
    else {
      const lang = isOT(b) ? "he" : "gr";
      let h = `<h4>${lang === "he" ? "히브리어 (WLC)" : "헬라어 (NA28)"} · 단어를 누르세요</h4><div class="vo ${lang}" ${lang === "he" ? 'dir="rtl" lang="he"' : 'lang="grc"'}>`;
      for (const w of ws) {
        const i = state.words.push({ w, b, c, v }) - 1;
        const cls = "w" + (w[6] === 2 ? " var" : "") + (w[6] === 1 ? " ttl" : "");
        h += `<button class="${cls}" type="button" data-w="${i}">${w[6] === 2 ? "[" + esc(w[0]) + "]" : esc(w[0])}<span class="g">${esc(w[2])}</span></button>`;
      }
      div.innerHTML = h + `</div>`;
    }
  } else if (tool === "comm") {
    div.innerHTML = await commPanelHTML(b, c, v);
  } else if (tool === "lxx") {
    let lx = null;
    try { const L = await loadLxx(b); lx = L[c] && L[c][v]; } catch {}
    if (!lx || !lx.length) div.innerHTML = `<p class="small">이 절은 70인역과 연결되지 않았습니다 (장절 배열 차이 또는 자료 없음).</p>`;
    else {
      let h = `<h4>70인역 (Swete) · 단어를 누르세요</h4><div class="vo gr" lang="grc">`;
      for (const x of lx) { const i = state.words.push({ lxx: x, b, c, v }) - 1; h += `<button class="w${x[1] ? "" : " var"}" type="button" data-w="${i}">${esc(x[0])}</button>`; }
      div.innerHTML = h + `</div>`;
    }
  } else if (tool === "xref") {
    let refs = [];
    try { const x = await loadXref(b); refs = x[c] && x[c][v] || []; } catch {}
    if (!refs.length) div.innerHTML = `<p class="small">관주가 없습니다.</p>`;
    else {
      div.innerHTML = `<h4>관주 ${refs.length}개 · 추천 많은 순</h4><div class="xr-list"></div>`;
      await fillXref(div.querySelector(".xr-list"), refs, 0);
    }
  }
  box.appendChild(div);
  btn?.setAttribute("aria-pressed", "true");
}
async function fillXref(listEl, refs, from) {
  const to = Math.min(refs.length, from + 12);
  let h = "";
  for (let i = from; i < to; i++) {
    const [b, c, v, ve] = refs[i];
    let t = "";
    if (state.hasKor) {
      const parts = [];
      for (let x = v; x <= (ve || v) && x < v + 6; x++) { const k = await korText(b, c, x); if (k) parts.push(k.x); }
      t = parts.join(" ");
    } else { try { const e = await loadEn(b); t = e[c] && e[c][v] || ""; } catch {} }
    const label = `${BOOKS[b-1][1]} ${c}:${v}${ve ? "-" + ve : ""}`;
    h += `<button class="xr-item" type="button" data-go="${b}.${c}.${v}"><span class="ref">${esc(label)}</span><span class="txt">${esc(t)}</span></button>`;
  }
  listEl.querySelector("[data-more]")?.remove();
  listEl.insertAdjacentHTML("beforeend", h);
  if (to < refs.length) {
    const more = document.createElement("button");
    more.type = "button"; more.className = "btn plain"; more.dataset.more = "1";
    more.textContent = `${refs.length - to}개 더 보기`;
    more.onclick = () => fillXref(listEl, refs, to);
    listEl.appendChild(more);
  }
}

// ---------- 단어 상세 ----------
async function showWord(i) {
  if (state.words[i].lxx) return showLxxWord(i);
  const { w, b, c, v } = state.words[i];
  document.querySelectorAll(".w.sel").forEach(e => e.classList.remove("sel"));
  document.querySelector(`.w[data-w="${i}"]`)?.classList.add("sel");
  const lang = isOT(b) ? "H" : "G";
  const [lex, morph, conc] = await Promise.all([loadLex(lang), loadMorph(), loadConc(lang).catch(() => ({}))]);
  const [surf, translit, eng, main, mcode, segs, flag] = w;
  const cls = lang === "H" ? "he" : "gr";
  let h = `<div class="big ${cls}">${esc(surf)}</div>`;
  h += `<dl class="kv"><dt>음역</dt><dd>${esc(translit) || "—"}</dd><dt>문맥 번역</dt><dd>${esc(eng) || "—"}</dd><dt>본문</dt><dd>${esc(refStr(b, c, v))}</dd></dl>`;
  if (flag === 2) h += `<p class="hint">이 단어는 NA28 비평본문에는 없고 공인본문(TR)에만 있는 이형입니다.</p>`;
  if (lang === "H" && segs.length > 1) {
    h += `<div class="card"><h3>단어 분해</h3><div class="segs">`;
    segs.forEach(([t, s]) => { const L = lex[s]; h += `<button class="seg${s === main ? " main" : ""}" type="button" data-lex="${esc(s)}"><span class="he">${esc(t)}</span><small>${esc(s)} · ${esc(L ? L[3] : "")}</small></button>`; });
    h += `</div></div>`;
  }
  const mrows = (mcode || "").split("/").filter(Boolean).map(code => morph[code]).filter(Boolean);
  if (mrows.length) {
    h += `<div class="card"><h3>문법 정보 <span class="small">${esc(mcode)}</span></h3>`;
    mrows.forEach((rows, idx) => {
      if (mrows.length > 1) h += `<p class="small">${idx + 1}번째 조각</p>`;
      h += `<dl class="kv">${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>`;
    });
    h += `</div>`;
  }
  h += lexCard(lex, main, lang, conc);
  h += `<div class="actions"><button class="btn" type="button" data-conc="${esc(main)}">용례 ${(conc[main] || []).length}곳 보기</button><button class="btn ghost" type="button" data-addword="${i}">노트에 담기</button></div>`;
  openSheet(`${refStr(b, c, v)} · ${surf}`, h);
}

// ---------- 노트 · 북마크 ----------
async function loadNotes() {
  state.notes = new Map((await idb.all("notes")).map(([k, v]) => [k, v]));
  state.marks = new Set(((await idb.get("meta", "marks")) || []));
}
async function showNote(key, append) {
  const [b, c, v] = fromKey(key);
  const n = state.notes.get(key);
  const k = await korText(b, c, v);
  let text = n ? n.text : "";
  if (append) text = (text ? text.replace(/\s+$/, "") + "\n" : "") + append;
  const h = `${k ? `<p style="font-family:var(--f-ko);margin:0">${esc(k.x)}</p>` : ""}
    <div class="field"><label for="noteText">묵상 · 연구 메모</label><textarea id="noteText">${esc(text)}</textarea></div>
    <div class="actions"><button class="btn" type="button" data-savenote="${key}">저장</button>${n ? `<button class="btn plain" type="button" data-delnote="${key}">삭제</button>` : ""}</div>
    <p class="hint">원어 단어 화면의 "노트에 담기"를 누르면 원어 정보가 한 줄씩 추가됩니다.</p>`;
  openSheet(`노트 · ${refStr(b, c, v)}`, h, { push: !!append });
  if (append) toast("단어를 메모에 담았습니다. 저장을 눌러 주세요.");
}
function markTools() {
  document.querySelectorAll('[data-tool="note"]').forEach(el => el.classList.toggle("has", state.notes.has(+el.dataset.k)));
  document.querySelectorAll('[data-tool="mark"]').forEach(el => el.classList.toggle("has", state.marks.has(+el.dataset.k)));
}
async function saveNote(key) {
  const text = $("#noteText").value.trim();
  if (!text) return delNote(key);
  const n = { text, updated: Date.now() };
  await idb.put("notes", key, n); state.notes.set(key, n);
  sheetStack = []; closeSheet(); toast("저장했습니다"); markTools();
}
async function delNote(key) {
  await idb.del("notes", key); state.notes.delete(key);
  sheetStack = []; closeSheet(); toast("노트를 지웠습니다"); markTools();
}
async function toggleMark(key) {
  if (state.marks.has(key)) state.marks.delete(key); else state.marks.add(key);
  await idb.put("meta", "marks", [...state.marks]);
  markTools(); toast(state.marks.has(key) ? "북마크했습니다" : "북마크를 뺐습니다");
}
async function showNotes(tab) {
  tab = tab || "notes";
  const notes = [...state.notes.entries()].sort((a, b) => a[0] - b[0]);
  const marks = [...state.marks].sort((a, b) => a - b);
  let h = `<div class="chips"><button class="chip" type="button" data-ntab="notes" aria-pressed="${tab === "notes"}">노트 ${notes.length}</button><button class="chip" type="button" data-ntab="marks" aria-pressed="${tab === "marks"}">북마크 ${marks.length}</button></div>`;
  if (tab === "notes") {
    h += `<div class="actions"><button class="btn" type="button" data-act="export" ${notes.length ? "" : "disabled"}>말씀서재로 내보내기 (.md)</button><button class="btn ghost" type="button" data-act="copymd" ${notes.length ? "" : "disabled"}>마크다운 복사</button></div>`;
    if (!notes.length) h += `<p class="hint">아직 노트가 없습니다. 절 아래 ✎를 누르면 메모를 남길 수 있습니다.</p>`;
    h += `<div class="list">`;
    for (const [k, n] of notes) { const [b, c, v] = fromKey(k); h += `<button class="item" type="button" data-go="${b}.${c}.${v}"><span class="ref">${esc(refStr(b, c, v))}</span><span class="txt">${esc(n.text.slice(0, 120))}${n.text.length > 120 ? "…" : ""}</span></button>`; }
    h += `</div>`;
  } else {
    if (marks.length) h += `<div class="actions"><button class="btn" type="button" data-act="showmarks">북마크 절 모아 보기</button></div>`;
    else h += `<p class="hint">절 아래 ⚑를 누르면 북마크됩니다.</p>`;
    h += `<div class="list">`;
    for (const k of marks) { const [b, c, v] = fromKey(k); const kt = await korText(b, c, v); h += `<button class="item" type="button" data-go="${b}.${c}.${v}"><span class="ref">${esc(refStr(b, c, v))}</span><span class="txt">${esc(kt ? kt.x : "")}</span></button>`; }
    h += `</div>`;
  }
  openSheet("노트 · 북마크", h, { full: true });
}

// ---------- 읽어주기 (TTS) ----------
let ttsQueue = [];
function speakKeys(keys) {
  if (!("speechSynthesis" in window)) return toast("이 기기는 읽어주기를 지원하지 않습니다");
  speechSynthesis.cancel(); ttsQueue = keys.slice();
  speakNext();
}
async function speakNext() {
  const key = ttsQueue.shift(); if (!key) return;
  const [b, c, v] = fromKey(key);
  const k = await korText(b, c, v);
  let text = k ? k.x : "", lang = "ko-KR";
  if (!text) { try { const e = await loadEn(b); text = e[c][v]; lang = "en-US"; } catch {} }
  if (!text) return speakNext();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang; u.rate = store.get("ttsRate", 1);
  u.onend = speakNext;
  document.querySelectorAll(".verse.hl").forEach(e => e.classList.remove("hl"));
  document.getElementById("r" + key)?.classList.add("hl");
  speechSynthesis.speak(u);
}

// ---------- 책·장 선택 ----------
function showPicker(selB) {
  const b = selB || state.b;
  let h = `<p class="testament">구약</p><div class="books">`;
  BOOKS.forEach(([name, ab], i) => {
    if (i === 39) h += `</div><p class="testament">신약</p><div class="books">`;
    h += `<button type="button" class="${i + 1 === b ? "cur" : ""}" data-pickb="${i + 1}" title="${esc(name)}">${esc(ab)}</button>`;
  });
  h += `</div><p class="testament">${esc(BOOKS[b-1][0])} · 장</p><div class="chaps">`;
  for (let c = 1; c <= BOOKS[b-1][2]; c++) h += `<button type="button" class="${b === state.b && c === state.c ? "cur" : ""}" data-pickc="${b}.${c}">${c}</button>`;
  openSheet("성경 선택", h + `</div>`, { full: true });
}

// ---------- 구간 선택 패널 ----------
function fillBooks(sel, val) {
  sel.innerHTML = BOOKS.map((x, i) => `<option value="${i + 1}"${i + 1 === val ? " selected" : ""}>${esc(x[0])}</option>`).join("");
}
async function fillCV(bSel, cSel, vSel, cVal, vVal) {
  const b = +bSel.value;
  cSel.innerHTML = `<option value="0">장</option>` + Array.from({ length: BOOKS[b-1][2] }, (_, i) => `<option value="${i + 1}"${i + 1 === cVal ? " selected" : ""}>${i + 1}</option>`).join("");
  const c = +cSel.value;
  const n = c ? await verseCount(b, c) : 0;
  vSel.innerHTML = `<option value="0">절</option>` + Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${i + 1 === vVal ? " selected" : ""}>${i + 1}</option>`).join("");
}
async function syncRange(b1, c1, v1, b2, c2, v2) {
  fillBooks($("#b1"), b1); fillBooks($("#b2"), b2);
  await fillCV($("#b1"), $("#c1"), $("#v1"), c1, v1);
  await fillCV($("#b2"), $("#c2"), $("#v2"), c2, v2);
}

// 범위 [b1,c1,v1]~[b2,c2,v2]의 모든 절 (장·절 0이면 처음/끝)
async function collectRange(b1, c1, v1, b2, c2, v2) {
  let a = [b1, c1, v1], z = [b2, c2, v2];
  const startKey = refKey(a[0], a[1] || 1, a[2] || 1), endKey = refKey(z[0], z[1] || 999, z[2] || 999);
  if (startKey > endKey) [a, z] = [z, a];
  const sK = refKey(a[0], a[1] || 1, a[2] || 1), eK = refKey(z[0], z[1] || 999, z[2] || 999);
  const out = [];
  for (let b = a[0]; b <= z[0]; b++) {
    for (let c = 1; c <= BOOKS[b-1][2]; c++) {
      if (refKey(b, c, 999) < sK || refKey(b, c, 0) > eK) continue;
      for (const r of await versesOf(b, c)) { const k = refKey(...r); if (k >= sK && k <= eK) out.push(r); }
    }
  }
  return out;
}
async function filterByTerms(list, terms, mode) {
  if (!terms.length) return { list, hits: 0 };
  const out = []; let hits = 0;
  for (const r of list) {
    const k = await korText(...r);
    let t = k ? k.x : "";
    if (!t) { try { const e = await loadEn(r[0]); t = e[r[1]][r[2]] || ""; } catch {} }
    const counts = terms.map(term => t.split(term).length - 1);
    const ok = mode === "and" ? counts.every(n => n > 0) : counts.some(n => n > 0);
    if (ok) { out.push(r); hits += counts.reduce((a, b) => a + b, 0); }
  }
  return { list: out, hits };
}
const LIMIT = 3000;
async function showList(list, label, terms, andor) {
  state.terms = terms || []; state.reasons = null;
  let info = "";
  if (state.terms.length) {
    const { list: f, hits } = await filterByTerms(list, state.terms, andor || "or");
    list = f;
    info = `<b>${esc(state.terms.join(andor === "and" ? " + " : " / "))}</b> · ${f.length.toLocaleString()}절 · 검색어 ${hits.toLocaleString()}회`;
  } else info = `${esc(label)} · ${list.length.toLocaleString()}절`;
  if (list.length > LIMIT) { info += ` · 처음 ${LIMIT.toLocaleString()}절만 표시`; list = list.slice(0, LIMIT); }
  state.mode = "range"; state.list = list;
  $("#locText").textContent = label;
  $("#info").innerHTML = info;
  await drawList();
  $("#reader").scrollIntoView({ block: "start" });
}

// ---------- 빠른 검색 (파워바이블 문법) ----------
function bookOf(name) {
  name = name.replace(/\s/g, "");
  let b = BOOKS.findIndex(x => x[1] === name || x[0] === name) + 1;
  if (!b) b = BOOKS.findIndex(x => x[0].startsWith(name)) + 1;
  return b;
}
const REF = /^\s*(\d?\s?[가-힣]+)\s*(\d+)(?:\s*[:장]\s*(\d+))?\s*절?\s*$/;
function parseOne(s) {
  const m = s.match(REF); if (!m) return null;
  const b = bookOf(m[1]); if (!b) return null;
  return [b, +m[2], m[3] ? +m[3] : 0];
}
async function quickSearch(q) {
  q = q.trim(); if (!q) return;
  try { const hist = store.get("qhist", []).filter(x => x !== q); hist.unshift(q); store.set("qhist", hist.slice(0, 20)); } catch {}
  // (7) 여러 절: 창 15:1; 출 1:2, 레 2:3
  if (q.includes(";") || /\d\s*,\s*[가-힣]/.test(q)) {
    const parts = q.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const refs = parts.map(parseOne);
    if (refs.every(Boolean)) {
      const list = [];
      for (const [b, c, v] of refs) list.push(...(v ? [[b, c, v]] : await versesOf(b, c)));
      return showList(list, q);
    }
  }
  // (5) 장 안 검색어: 창 15~아브람
  let m = q.match(/^(.+?)~(.+)$/);
  if (m) {
    const r = parseOne(m[1]);
    if (r) return showList(r[2] ? [[r[0], r[1], r[2]]] : await versesOf(r[0], r[1]), `${refStr(r[0], r[1])}`, m[2].split(/[,\s]+/).filter(Boolean), "and");
  }
  // (3)(4) 구간: 창 15:1-16 / 창 15:1-출 1:2
  m = q.match(/^(.+?\d+(?:\s*[:장]\s*\d+)?)\s*-\s*(.+)$/);
  if (m) {
    const a = parseOne(m[1]);
    let z = /^\d+$/.test(m[2].trim()) ? (a && a[2] ? [a[0], a[1], +m[2]] : a && [a[0], +m[2], 0]) : parseOne(m[2]);
    if (a && z) return showList(await collectRange(a[0], a[1], a[2], z[0], z[1], z[2]), q);
  }
  // (1)(2) 한 절 / 한 장
  const r = parseOne(q);
  if (r && r[1] <= BOOKS[r[0]-1][2]) return go(r[0], r[1], r[2]);
  // 책 이름만: 그 책 1장
  if (/^[가-힣\d\s]+$/.test(q) && BOOKS.some(x => x[0] === q.replace(/\s/g, "") || x[1] === q.replace(/\s/g, ""))) return go(bookOf(q), 1);
  // (6) 전체 검색어: 사랑, 믿음
  const terms = q.split(/[,]+/).map(s => s.trim()).filter(Boolean);
  if (!state.hasKor) toast("한글 본문이 없어 영어(KJV)에서 찾습니다");
  return showList(await collectRange(1, 0, 0, 66, 0, 0), "성경 전체", terms, $("#andor").value);
}
async function rangeSearch() {
  const g = id => +$(id).value;
  const terms = $("#kw").value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  const list = await collectRange(g("#b1"), g("#c1"), g("#v1"), g("#b2"), g("#c2"), g("#v2"));
  const lab = (b, c, v) => `${BOOKS[b-1][1]}${c ? " " + c : ""}${v ? ":" + v : ""}`;
  const label = `${lab(g("#b1"), g("#c1"), g("#v1"))} ~ ${lab(g("#b2"), g("#c2"), g("#v2"))}`;
  if (!terms.length && list.length > LIMIT) toast(`${list.length.toLocaleString()}절이라 검색어 없이 처음 ${LIMIT}절만 보여 드립니다`);
  return showList(list, label, terms, $("#andor").value);
}
function showHelp() {
  const rows = [["창 15:1", "한 절"], ["창 15", "한 장"], ["창 15:1-16", "같은 장 구간"], ["창 15:1-출 1:2", "책을 넘는 구간"], ["창 15~아브람", "한 장 안에서 단어 찾기"], ["사랑, 믿음", "성경 전체에서 단어 찾기 (and/or는 아래 선택값)"], ["창 15:1; 출 1:2, 레 2:3", "떨어진 절 묶어 보기"]];
  const hist = store.get("qhist", []);
  const h = `<dl class="kv help">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>
    <p class="hint">구간 선택에서 장·절을 비워 두면 책 전체가 범위가 됩니다. 끝 책이 시작 책보다 앞이어도 됩니다.</p>
    ${hist.length ? `<h3 class="small">최근 검색</h3><div class="chips">${hist.map(x => `<button class="chip" type="button" data-q="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}`;
  openSheet("빠른 검색 문법", h);
}

function lexCard(lex, s, lang, conc) {
  const L = lex[s];
  if (!L) return `<div class="card"><h3>사전</h3><p class="hint">${esc(s)} 항목을 사전에서 찾지 못했습니다.</p></div>`;
  const [lemma, tr, pos, gloss, def, rel, link] = L;
  const cls = lang === "H" ? "he" : "gr";
  let h = `<div class="card"><h3>사전 · ${lang === "H" ? "히브리어" : "헬라어"}</h3>`;
  h += `<div class="lemma"><span class="${cls}" ${cls === "he" ? 'dir="rtl"' : ""}>${esc(lemma)}</span><span>${esc(tr)}</span><span class="strong">${esc(s)}</span><b>${esc(gloss)}</b></div>`;
  if (rel && link) h += `<p class="small">${esc(relKo(rel))} <button class="linklike" type="button" data-lex="${esc(link)}">${esc(link)}</button></p>`;
  if (def) {
    const lxx = (def.match(/\[in LXX[^\]]*\]/) || [])[0];
    if (lxx) h += `<p class="tip small"><b>70인역</b> ${esc(lxx.replace(/^\[|\]$/g, ""))}</p>`;
    h += `<div class="def" id="def">${esc(def)}</div><div><button class="linklike" type="button" data-act="moredef">전체 보기</button></div>`;
  }
  if (conc && conc[s]) h += `<p class="small">성경 전체 ${conc[s].length}절에 나옵니다.</p>`;
  return h + `</div>`;
}
function relKo(rel) {
  const r = rel.toLowerCase();
  if (r.includes("aramaic")) return "아람어 형태 · 관련 히브리어:";
  if (r.includes("greek of")) return "히브리어 대응어:";
  if (r.includes("name of")) return "같은 이름의 기본 항목:";
  return rel + ":";
}
async function showLex(s) {
  const lang = s[0];
  const [lex, conc] = await Promise.all([loadLex(lang), loadConc(lang).catch(() => ({}))]);
  const h = lexCard(lex, s, lang, conc) +
    `<div class="actions"><button class="btn" type="button" data-conc="${esc(s)}">용례 ${(conc[s] || []).length}곳 보기</button></div>`;
  openSheet(`${s} · ${lex[s] ? lex[s][3] : ""}`, h, { push: true });
}

// ---------- 컨코던스 ----------
const concState = { s: "", refs: [], filter: "all", shown: 0 };
async function showConc(s) {
  const lang = s[0];
  const [conc, lex] = await Promise.all([loadConc(lang), loadLex(lang)]);
  concState.s = s; concState.refs = conc[s] || []; concState.filter = "all"; concState.shown = 0;
  const L = lex[s];
  const head = L ? `<div class="lemma"><span class="${lang === "H" ? "he" : "gr"}">${esc(L[0])}</span><span>${esc(L[1])}</span><span class="strong">${esc(s)}</span><b>${esc(L[3])}</b></div>` : "";
  const sameBook = concState.refs.filter(k => fromKey(k)[0] === state.b).length;
  const h = `${head}<div class="chips" role="group" aria-label="범위">
    <button class="chip" type="button" data-cf="all" aria-pressed="true">전체 ${concState.refs.length}</button>
    <button class="chip" type="button" data-cf="book" aria-pressed="false">${esc(BOOKS[state.b-1][0])} ${sameBook}</button>
    <button class="chip" type="button" data-cf="ot" aria-pressed="false">구약</button>
    <button class="chip" type="button" data-cf="nt" aria-pressed="false">신약</button></div>
    ${state.hasKor ? "" : `<p class="hint">개역개정을 불러오면 구절 본문이 함께 보입니다.</p>`}
    <div class="list" id="concList"></div><div id="concMore"></div>`;
  openSheet(`용례 · ${L ? L[0] : s}`, h, { push: true, full: true });
  drawConc(true);
}
function concFiltered() {
  const f = concState.filter;
  return concState.refs.filter(k => {
    const b = fromKey(k)[0];
    return f === "all" || (f === "book" && b === state.b) || (f === "ot" && b <= 39) || (f === "nt" && b >= 40);
  });
}
async function drawConc(reset) {
  const list = $("#concList"); if (!list) return;
  const refs = concFiltered();
  if (reset) { list.innerHTML = ""; concState.shown = 0; }
  const from = concState.shown, to = Math.min(refs.length, from + 150);
  let h = "", lastBook = from ? fromKey(refs[from - 1])[0] : 0;
  for (let i = from; i < to; i++) {
    const [b, c, v] = fromKey(refs[i]);
    if (b !== lastBook) { h += `<p class="group-h">${esc(BOOKS[b-1][0])}</p>`; lastBook = b; }
    let txt = "";
    if (state.hasKor) { const k = await loadKor(b); txt = k && k[c] && k[c][v] ? k[c][v].x : ""; }
    h += `<button class="item" type="button" data-go="${b}.${c}.${v}"><span class="ref">${esc(refStr(b, c, v))}</span>${txt ? `<span class="txt">${esc(txt)}</span>` : ""}</button>`;
  }
  list.insertAdjacentHTML("beforeend", h);
  concState.shown = to;
  $("#concMore").innerHTML = to < refs.length ? `<button class="btn plain" type="button" data-act="concmore">${refs.length - to}곳 더 보기</button>` : (refs.length ? "" : `<p class="hint">이 범위에는 용례가 없습니다.</p>`);
}


async function buildMarkdown() {
  const items = [...state.notes.entries()].sort((a, b) => a[0] - b[0]);
  const today = new Date();
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let md = `---\n날짜: ${d}\n도구: 원어서재\n태그: [원어연구, 말씀서재]\n---\n\n# 원어서재 노트 (${d})\n`;
  let lastBook = 0;
  for (const [key, n] of items) {
    const [b, c, v] = fromKey(key);
    if (b !== lastBook) { md += `\n## ${BOOKS[b-1][0]}\n`; lastBook = b; }
    const k = await loadKor(b);
    const kt = k && k[c] && k[c][v] ? k[c][v].x : "";
    md += `\n### ${refStr(b, c, v)}\n`;
    if (kt) md += `> ${kt}\n\n`;
    md += n.text + "\n";
  }
  md += `\n---\n원어 데이터: STEPBible.org (Tyndale House, Cambridge), CC BY 4.0\n`;
  return { md, name: `원어서재-노트-${d}.md` };
}
async function exportNotes() {
  const { md, name } = await buildMarkdown();
  const file = new File([md], name, { type: "text/markdown" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("다운로드 폴더에 저장했습니다");
}
async function copyMarkdown() {
  const { md } = await buildMarkdown();
  try { await navigator.clipboard.writeText(md); toast("복사했습니다. 옵시디언에 붙여넣으세요."); }
  catch { toast("복사가 막혀 있습니다. 내보내기를 써 주세요."); }
}


// ---------- 설정 · 불러오기 ----------
async function showSettings() {
  const meta = (await idb.get("meta", "kor")) || null;
  const h = `<div class="card"><h3>한글 성경 파일</h3>
    ${meta ? `<p><b>${esc(meta.name)}</b> · ${meta.count.toLocaleString()}절 · ${new Date(meta.at).toLocaleDateString("ko-KR")} 불러옴</p>` : `<p>아직 불러온 파일이 없습니다.</p>`}
    <p class="hint">갖고 계신 성경 파일(.bdb, SQLite 형식)을 고르세요. 이 휴대폰 안에만 저장되고 인터넷으로 보내지지 않습니다.</p>
    <input type="file" id="bdbFile" accept=".bdb,.db,.sqlite,.sqlite3,application/octet-stream">
    <div class="progress" hidden id="impProg"><span></span></div><p class="small" id="impMsg"></p>
    ${meta ? `<div><button class="btn plain" type="button" data-act="delkor">한글 본문 지우기</button></div>` : ""}</div>
  <div class="card"><h3>오프라인 저장</h3>
    <p class="hint">지금은 읽은 책만 저장됩니다. 와이파이에서 한 번 눌러 두면 인터넷 없이 모든 기능을 쓸 수 있습니다 (약 30MB 전송).</p>
    <div><button class="btn ghost" type="button" data-act="offline">전체 원어 데이터 저장</button></div>
    <div class="progress" hidden id="offProg"><span></span></div><p class="small" id="offMsg"></p></div>
  <div class="card"><h3>글자 크기</h3><div class="row"><input type="range" id="fs" min="14" max="30" step="1" value="${state.fs}" style="flex:1"><span id="fsv">${state.fs}px</span></div></div>
  <div class="card"><h3>읽어주기 속도</h3><select id="ttsRate">${[0.8,1,1.2,1.5].map(r => `<option value="${r}"${store.get("ttsRate",1)===r?" selected":""}>${r}배</option>`).join("")}</select>
    <p class="hint">한국어 목소리가 어색하면 휴대폰 설정 → 일반 → 글자 읽어주기 → 기본 엔진을 삼성 TTS로 바꿔 보세요.</p></div>
  <div class="card"><h3>자료 출처</h3>
    <p class="small">히브리어·헬라어 원문, 스트롱 번호, 문법 분해, 사전: <b>STEPBible.org</b> (Tyndale House, Cambridge) 데이터, CC BY 4.0. 관주: OpenBible.info, CC BY. 70인역: Swete 판(First1KGreek / nathans/lxx-swete), CC BY-SA 4.0 — 스캔 본문이라 오탈자가 있을 수 있고, 문법 분해는 신약에 같은 형태가 있을 때만 추정으로 붙였습니다. 영어: KJV(퍼블릭 도메인). 헬라어 본문은 NA28 기준이며 공인본문(TR)에만 있는 단어는 [괄호]로 흐리게 표시합니다.</p>
    <p class="small">한글 본문은 사용자가 직접 불러온 개인 파일이며 앱에 포함되어 있지 않습니다.</p></div>`;
  openSheet("설정", h, { full: true });
}

async function importBdb(file) {
  const msg = $("#impMsg"), prog = $("#impProg"), bar = prog.querySelector("span");
  prog.hidden = false; bar.style.width = "10%"; msg.textContent = "파일을 여는 중…";
  try {
    if (!window.initSqlJs) throw new Error("SQLite 도구를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.");
    const SQL = await initSqlJs({ locateFile: f => "vendor/" + f });
    const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
    bar.style.width = "35%";
    // 표 이름과 열 이름을 찾는다 (book/chapter/verse/본문)
    const tables = db.exec("select name from sqlite_master where type='table'")[0]?.values.map(r => r[0]) || [];
    let found = null;
    for (const t of tables) {
      const cols = db.exec(`pragma table_info("${t}")`)[0]?.values.map(r => String(r[1])) || [];
      const pick = re => cols.find(c => re.test(c));
      const cb = pick(/^(book|bk|book_?num(ber)?)$/i), cc = pick(/^(chapter|ch|chap)$/i), cv = pick(/^(verse|vs|vn)$/i);
      const ct = pick(/^(btext|text|content|scripture|verse_?text|words?)$/i);
      if (cb && cc && cv && ct) { found = { t, cb, cc, cv, ct }; break; }
    }
    if (!found) throw new Error("성경 표(책·장·절·본문)를 찾지 못했습니다. 파일 형식을 알려 주시면 맞춰 드릴게요.");
    const res = db.exec(`select "${found.cb}","${found.cc}","${found.cv}","${found.ct}" from "${found.t}" order by 1,2,3`)[0];
    db.close();
    const byBook = {};
    let count = 0;
    for (const [b, c, v, raw] of res.values) {
      const bn = +b; if (!(bn >= 1 && bn <= 66)) continue;
      let x = String(raw ?? ""), t = "";
      const tm = x.match(/^\s*<font[^>]*>(.*?)<\/font>\s*(?:<br\s*\/?>)?/i);
      if (tm) { t = tm[1].replace(/<[^>]+>/g, "").trim(); x = x.slice(tm[0].length); }
      x = x.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      ((byBook[bn] ||= {})[c] ||= {})[v] = t ? { x, t } : { x };
      count++;
    }
    bar.style.width = "70%"; msg.textContent = `${count.toLocaleString()}절을 저장하는 중…`;
    await idb.clear("kor");
    for (const bn of Object.keys(byBook)) await idb.put("kor", +bn, byBook[bn]);
    await idb.put("meta", "kor", { name: file.name, count, at: Date.now() });
    korCache.clear(); state.hasKor = true;
    bar.style.width = "100%"; msg.textContent = `완료: ${count.toLocaleString()}절을 불러왔습니다.`;
    toast("한글 본문을 불러왔습니다");
    showChapter(state.b, state.c);
  } catch (e) {
    msg.textContent = "불러오지 못했습니다: " + e.message; bar.style.width = "0";
  }
}

async function saveOffline() {
  const msg = $("#offMsg"), prog = $("#offProg"), bar = prog.querySelector("span");
  prog.hidden = false;
  const files = ["data/vlem.json", "data/vcount.json", "data/morph.json", "data/lex/H.json", "data/lex/G.json", "data/conc/H.json", "data/conc/G.json"];
  for (let b = 1; b <= 66; b++) for (const dir of ["books", "en", "xref", ...(b <= 39 ? ["lxx"] : [])]) files.push(`data/${dir}/${String(b).padStart(2, "0")}.json`);
  let done = 0, fail = 0;
  for (const f of files) {
    try { const r = await fetch(f); if (!r.ok) fail++; await r.arrayBuffer(); } catch { fail++; }
    done++; bar.style.width = (done / files.length * 100) + "%"; msg.textContent = `${done} / ${files.length}`;
  }
  msg.textContent = fail ? `${fail}개를 받지 못했습니다. 다시 눌러 주세요.` : "모두 저장했습니다. 이제 인터넷 없이 쓸 수 있습니다.";
}


// ---------- 패드(메뉴) ----------
const PADS = {
  home: ["본문", "Basic Pad"], inter: ["인터리니어 패드", "Interlinear Pad"], tts: ["TTS 패드", "TTS Pad"],
  copy: ["필사 패드", "Copy Pad"], plan: ["연간 읽기표", "Reading Plan"], kateta: ["카테타 패드", "Kateta Pad"]
};
const loadLxx = b => getJSON(`data/lxx/${String(b).padStart(2, "0")}.json`);

function showMenu() {
  const items = [["home", "⌂", "본문 (홈)"], ["inter", "≡", "인터리니어 패드"], ["tts", "♪", "TTS 패드"], ["copy", "✍", "필사 패드"], ["kateta", "❝", "카테타 패드 (주석)"],
    ["plan", "▦", "연간 읽기표"], ["notes", "✎", "묵상 노트"], ["marks", "⚑", "저장 목록 (북마크)"]];
  const h = `<nav class="menu">${items.map(([k, i, n]) => `<button type="button" class="${state.pad === k ? "cur" : ""}" data-pad="${k}"><span class="mi">${i}</span>${n}</button>`).join("")}
    <hr><button type="button" data-act="settings"><span class="mi">⚙</span>설정</button></nav>
    <p class="small">원어: STEPBible.org · 70인역: Swete (First1KGreek) · 관주: OpenBible.info · 영어: KJV · 주석: Free Use Bible API</p>`;
  openSheet("원어서재", h, { side: true });
}
function setPad(p) {
  speechSynthesis?.cancel?.();
  state.pad = p; store.set("pad", p);
  $("#padName").textContent = PADS[p] ? PADS[p][1] : "";
  $("#ttsBar").hidden = p !== "tts";
  if (p === "plan") return showPlan();
  drawList();
}


// ---------- 카테타 패드 (영어 주석, Free Use Bible API에서 온라인으로 불러옴) ----------
const COMMS = [
  ["john-gill", "존 길", "Gill"], ["john-calvin", "칼빈", "Calvin"], ["matthew-henry", "매튜 헨리", "Henry"],
  ["adam-clarke", "아담 클라크", "Clarke"], ["jamieson-fausset-brown", "JFB", "JFB"], ["keil-delitzsch", "카일-델리취 (구약)", "K&D"]
];
const USFM = "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split(" ");
const commCache = new Map();
const curComm = () => store.get("comm", "john-gill");

// 주석 본문 조각(문자열, {text}, {content:[...]}, 줄바꿈 등)을 글자로 이어 붙인다
function flat(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(flat).join("");
  if (x.lineBreak || x.type === "line_break") return "\n";
  if (typeof x.text === "string") return x.text;
  if (x.content) return flat(x.content);
  if (x.heading) return flat(x.heading) + "\n";
  return "";
}
// 한 장의 주석을 {절: 글} 로 만든다. 실패하면 오류를 던진다.
async function loadComm(id, b, c) {
  const key = `${id}/${b}/${c}`;
  if (commCache.has(key)) return commCache.get(key);
  const p = (async () => {
    const r = await fetch(`https://bible.helloao.org/api/c/${id}/${USFM[b-1]}/${c}.json`);
    if (r.status === 404) return { none: true };
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const out = { intro: flat(j.chapter && j.chapter.introduction).trim(), v: {} };
    let last = 0;
    for (const item of (j.chapter && j.chapter.content) || []) {
      if (item.type === "verse") { last = +item.number; out.v[last] = (out.v[last] ? out.v[last] + "\n\n" : "") + flat(item.content).trim(); }
      else if (last && item.type !== "heading") out.v[last] += "\n" + flat(item.content || item).trim();
    }
    return out;
  })();
  commCache.set(key, p);
  try { return await p; } catch (e) { commCache.delete(key); throw e; }
}
// 이 절에 해당하는 주석 (주석이 여러 절을 묶어 앞 절에 달려 있으면 그 절을 찾아 올라간다)
function commFor(ch, v) {
  if (ch.v[v]) return { from: v, text: ch.v[v] };
  for (let x = v - 1; x >= 1 && x >= v - 6; x--) if (ch.v[x]) return { from: x, text: ch.v[x], shared: true };
  return null;
}
function commChips(sel, scope) {
  return `<div class="chips comm-chips" role="group" aria-label="주석 선택">${COMMS.map(([id, ko]) =>
    `<button class="chip" type="button" data-comm="${id}" data-scope="${scope}" aria-pressed="${id === sel}">${esc(ko)}</button>`).join("")}</div>`;
}
const gtrans = t => `https://translate.google.com/?sl=en&tl=ko&op=translate&text=${encodeURIComponent(t.slice(0, 4500))}`;
function commBlock(name, ref, text, shared) {
  const long = text.length > 700;
  return `<div class="comm"><p class="comm-src">${esc(name)} · ${esc(ref)}${shared ? " (앞 절과 묶인 주석)" : ""}</p>
    <div class="comm-text${long ? " clip" : ""}">${esc(text)}</div>
    <div class="row">${long ? `<button class="linklike" type="button" data-act="commmore">전체 보기</button>` : ""}
    <a class="linklike" href="${gtrans(text)}" target="_blank" rel="noopener">한국어로 번역 (구글)</a></div></div>`;
}
// 절 아래 패널
async function commPanelHTML(b, c, v) {
  const id = curComm(), name = COMMS.find(x => x[0] === id)[1];
  let h = `<h4>카테타 · 영어 주석</h4>${commChips(id, "panel")}`;
  try {
    const ch = await loadComm(id, b, c);
    const hit = !ch.none && commFor(ch, v);
    h += hit ? commBlock(name, `${BOOKS[b-1][1]} ${c}:${hit.from}`, hit.text, hit.shared) : `<p class="small">${esc(name)} 주석에는 이 절(또는 이 책)에 대한 내용이 없습니다. 다른 주석을 골라 보세요.</p>`;
  } catch {
    h += `<p class="small">주석은 인터넷에서 불러옵니다. 연결을 확인한 뒤 다시 눌러 주세요. 한 번 본 장은 이 휴대폰에 저장되어 인터넷 없이도 보입니다.</p>`;
  }
  return h;
}
// 카테타 패드: 절마다 주석을 이어서 보여준다
async function katetaHTML(b, c, v) {
  const id = curComm(), name = COMMS.find(x => x[0] === id)[1];
  try {
    const ch = await loadComm(id, b, c);
    if (ch.none) return v === 1 ? `<p class="small">${esc(name)} 주석은 ${esc(BOOKS[b-1][0])}을(를) 다루지 않습니다.</p>` : "";
    const intro = v === 1 && ch.intro ? commBlock(name, `${BOOKS[b-1][1]} ${c}장 서론`, ch.intro) : "";
    return intro + (ch.v[v] ? commBlock(name, `${BOOKS[b-1][1]} ${c}:${v}`, ch.v[v]) : "");
  } catch {
    return v === 1 ? `<p class="small">주석을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</p>` : "";
  }
}


// ---------- 맥락 검색 ----------
// 1) 문장에서 핵심어를 뽑고(조사·어미 떼기, 비슷한 말 더하기)
// 2) 핵심어가 들어 있는 구절(씨앗)을 찾은 뒤
// 3) 그 구절들의 원어 단어 가운데 두드러진 것(맥락 개념)을 고르고
// 4) 같은 원어 개념이 쓰인 구절 + 씨앗 구절의 관주까지 모아 점수순으로 보여 준다.
const CTX_STOP = new Set("나 나는 내가 내 저 저는 제가 제 우리 우리는 너 너는 당신 그 그는 이 저것 이것 그것 것 수 때 등 및 또 더 좀 잘 안 못 왜 어떻게 무엇 무슨 누구 누가 어디 언제 어떤 어느 정말 너무 많이 많은 아주 매우 다 모든 하나 요즘 요새 최근 오늘 늘 항상 자꾸 계속 성경 구절 말씀 찾아 찾아줘 알려 알려줘 관한 관련 대한 대해 대해서 있다 있는 없다 없는 하다 되다 같다 싶다 사람들".split(" "));
const CTX_END = ["하였습니다", "했습니다", "합니다", "입니다", "하는가", "하는지", "하는데", "인가요", "인가", "일까", "할까", "하는", "하다", "한다", "스러운", "스럽다", "되는", "된다", "적인", "한", "된", "할", "했다", "하고", "하며", "해요", "해서", "하게", "하지", "하면", "에게서", "에게", "께서", "으로", "에서", "까지", "부터", "처럼", "보다", "이란", "이라", "이다", "였다", "었다", "았다", "스럽", "들이", "들을", "들은", "들의", "들", "을", "를", "이", "가", "은", "는", "의", "에", "와", "과", "도", "로", "만", "요", "다", "고", "며", "게", "지", "니", "냐"];
const CTX_SYN = {
  힘들: ["수고", "곤고", "괴로", "고난", "무거운"], 힘든: ["수고", "곤고", "괴로", "고난"], 지치: ["피곤", "곤비", "쉬"], 피곤: ["곤비", "쉬"],
  걱정: ["염려", "근심"], 불안: ["염려", "두려", "근심"], 두렵: ["두려", "무서"], 두려: ["두려", "무서"], 무섭: ["두려", "무서"],
  외롭: ["외로", "홀로", "버리"], 외로: ["홀로", "버리"], 슬프: ["슬퍼", "애통", "눈물", "울"], 슬픔: ["슬퍼", "애통", "눈물"], 우울: ["낙심", "근심", "슬퍼"],
  화나: ["분노", "노하", "성내"], 화: ["분노", "노하", "성내"], 분노: ["노하", "성내", "진노"], 용서: ["사하", "용서", "사함"],
  돈: ["재물", "돈", "은", "부요"], 부자: ["부요", "부자", "재물"], 가난: ["가난", "궁핍", "빈궁"], 재물: ["재물", "부요"],
  아내: ["아내", "여자"], 남편: ["남편", "지아비"], 부부: ["남편", "아내", "장가", "시집"], 결혼: ["장가", "시집", "혼인"],
  자녀: ["자녀", "자식", "아들"], 아이: ["아이", "자식", "어린"], 자식: ["자녀", "아들"], 부모: ["부모", "아비", "어미", "공경"],
  죽음: ["죽", "사망"], 죽: ["사망"], 병: ["병", "질병", "고치", "낫"], 아프: ["병", "고치", "낫", "고통"], 아픔: ["고통", "상처"],
  감사: ["감사", "찬송"], 기쁨: ["기뻐", "즐거"], 기쁘: ["기뻐", "즐거"], 행복: ["복", "즐거", "기뻐"], 평안: ["평강", "평안", "화평"], 평화: ["평강", "화평"],
  교만: ["교만", "거만", "높이"], 겸손: ["겸손", "낮추"], 믿음: ["믿음", "믿"], 소망: ["소망", "바라"], 희망: ["소망", "바라"],
  사랑: ["사랑", "인애", "긍휼"], 기도: ["기도", "구하", "부르짖"], 유혹: ["시험", "유혹", "꾀"], 정치: ["권세", "다스리", "통치", "권력"],
  직장: ["수고", "일", "품꾼", "삯"], 일: ["수고", "일하", "노동"], 친구: ["친구", "벗", "이웃"], 원수: ["원수", "대적"], 전쟁: ["전쟁", "싸움"],
  창조: ["창조", "지으", "만드"], 위로: ["위로", "안위"], 죄: ["죄", "악", "허물"], 구원: ["구원", "건지", "속량"], 천국: ["천국", "하늘", "영생"],
  가정: ["집", "가족", "아내", "남편", "자녀"], 나라: ["나라", "민족"], 지혜: ["지혜", "명철"], 순종: ["순종", "청종", "지키"], 거짓: ["거짓", "속이"]
};
function ctxTokens(q) {
  const out = [];
  for (let w of q.replace(/[^가-힣a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean)) {
    if (CTX_STOP.has(w)) continue;
    let s = w;
    for (let k = 0; k < 3 && !CTX_SYN[s]; k++) {
      // 남는 말이 두 글자 이상일 때만 떼어 낸다 (힘들다 → 힘들, 사람들 → 사람)
      const e = CTX_END.find(e => s.endsWith(e) && (s.length - e.length >= 2 || (s.length - e.length === 1 && CTX_SYN[s.slice(0, -e.length)])));
      if (!e) break;
      s = s.slice(0, -e.length);
    }
    if (CTX_STOP.has(s) || (!s.length)) continue;
    if (s.length === 1 && !CTX_SYN[s]) continue;
    if (!out.some(t => t.stem === s)) out.push({ word: w, stem: s, syn: CTX_SYN[s] || CTX_SYN[w] || [] });
  }
  return out;
}
const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function ctxSearch(q) {
  q = q.trim(); if (!q) return;
  if (!state.hasKor) return toast("맥락 검색은 개역개정을 불러온 뒤에 쓸 수 있습니다");
  if (/^\d?\s?[가-힣]+\s*\d+(:\d+)?$/.test(q)) return toast("장절은 빠른 검색에 넣어 주세요");
  const toks = ctxTokens(q);
  if (!toks.length) return toast("핵심어를 찾지 못했습니다. 명사나 진술형 문장으로 써 보세요");
  $("#info").innerHTML = "맥락을 찾는 중…";
  try { const hist = store.get("chist", []).filter(x => x !== q); hist.unshift(q); store.set("chist", hist.slice(0, 20)); } catch {}

  // 모든 절의 한글 본문
  const verses = [];
  for (let b = 1; b <= 66; b++) {
    const k = await loadKor(b); if (!k) continue;
    for (const c in k) for (const v in k[c]) verses.push([refKey(b, +c, +v), k[c][v].x]);
  }
  const N = verses.length;
  // 핵심어마다 (원래 말 1.0, 비슷한 말 0.6) 정규식과 희소성
  const terms = [];
  for (const t of toks) {
    terms.push({ tok: t, s: t.stem, w: 1 });
    for (const s of t.syn) if (s !== t.stem) terms.push({ tok: t, s, w: 0.6 });
  }
  for (const t of terms) {
    t.re = new RegExp("(^|[\\s\"'(“‘])" + reEsc(t.s));
    t.df = 0;
  }
  const hitsBy = new Map(), vlen = new Map();
  for (const [key, x] of verses) {
    let row = null;
    for (const t of terms) if (t.re.test(x)) { t.df++; (row ||= []).push(t); }
    if (row) { hitsBy.set(key, row); vlen.set(key, x.length); }
  }
  for (const t of terms) t.idf = Math.log((N + 1) / (t.df + 1));
  const textScore = new Map();
  for (const [key, row] of hitsBy) {
    const per = new Map(); // 핵심어별 가장 높은 값
    for (const t of row) per.set(t.tok, Math.max(per.get(t.tok) || 0, t.w * t.idf));
    let s = 0; for (const v of per.values()) s += v;
    s *= 1 + 0.5 * (per.size - 1); // 여러 핵심어가 함께 있으면 가산
    if (row.some(t => t.w === 1)) s *= 1.15; // 검색한 말이 그대로 나오면 조금 더
    s *= 1 + 0.15 * Math.min(row.length, 4); // 여러 번 나오면 조금 더
    s /= 1 + vlen.get(key) / 160; // 긴 구절은 조금 덜
    textScore.set(key, s);
  }
  if (!textScore.size) { $("#info").textContent = "이 핵심어가 들어 있는 구절을 찾지 못했습니다."; return; }
  const maxT = Math.max(...textScore.values());
  const seeds = [...textScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

  // 맥락 개념: 씨앗 구절들에 두드러지게 나오는 원어 단어
  const [vlem, concH, concG, lexH, lexG] = await Promise.all([getJSON("data/vlem.json"), loadConc("H"), loadConc("G"), loadLex("H"), loadLex("G")]);
  const conc = s => (s[0] === "H" ? concH : concG)[s] || [];
  const lemOf = key => { const [b, c, v] = fromKey(key); return (vlem[b] && vlem[b][c] && vlem[b][c][v]) || []; };
  const cw = new Map(), cn = new Map();
  for (const [key, s] of seeds) for (const L of lemOf(key)) { cw.set(L, (cw.get(L) || 0) + s / maxT); cn.set(L, (cn.get(L) || 0) + 1); }
  const concepts = [...cw.entries()].map(([L, w]) => {
    const df = conc(L).length;
    return [L, df >= 3 && df <= 1500 && cn.get(L) >= Math.min(3, Math.ceil(seeds.length / 4)) ? w * Math.log(N / df) : 0];
  }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxC = concepts.length ? concepts[0][1] : 1;

  // 후보 모으기
  const score = new Map(), why = new Map();
  const add = (key, s, reason) => { score.set(key, (score.get(key) || 0) + s); if (reason) { const r = why.get(key) || new Set(); r.add(reason); why.set(key, r); } };
  for (const [key, s] of textScore) add(key, s / maxT, "단어");
  for (const [L, w] of concepts) {
    const lx = (L[0] === "H" ? lexH : lexG)[L];
    const label = lx ? lx[0] : L;
    for (const key of conc(L)) add(key, 0.55 * (w / maxC), label);
  }
  const top = seeds.slice(0, 15);
  for (let i = 0; i < top.length; i++) {
    const [key, s] = top[i]; const [b, c, v] = fromKey(key);
    let refs = [];
    try { const x = await loadXref(b); refs = (x[c] && x[c][v]) || []; } catch {}
    refs.slice(0, 15).forEach(([tb, tc, tv], r) => add(refKey(tb, tc, tv), 0.5 * (s / maxT) / (1 + r / 4), "관주 " + refStr(b, c, v)));
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);

  // 화면
  state.mode = "ctx"; state.pad = state.pad === "plan" ? "home" : state.pad;
  state.list = ranked.map(([k]) => fromKey(k));
  state.terms = [...new Set(terms.filter(t => t.df).map(t => t.s))];
  state.reasons = new Map(ranked.map(([k]) => [k, [...(why.get(k) || [])]]));
  const lab = concepts.slice(0, 4).map(([L]) => { const lx = (L[0] === "H" ? lexH : lexG)[L]; return lx ? `<span class="${L[0] === "H" ? "he" : "gr"}">${esc(lx[0])}</span> ${esc(lx[3])}` : esc(L); });
  const seedTxt = verses.find(v => v[0] === ranked[0][0]);
  $("#locText").textContent = "맥락 검색";
  $("#info").innerHTML = `<span class="ctx-box"><b>핵심어</b> ${toks.map(t => esc(t.stem) + (t.syn.length ? `<small> (+${esc(t.syn.slice(0, 3).join(", "))})</small>` : "")).join(" · ")}<br>
    ${lab.length ? `<b>맥락 개념</b> ${lab.join(" · ")}<br>` : ""}<b>대표 구절</b> ${esc(refStr(...fromKey(ranked[0][0])))} “${esc((seedTxt ? seedTxt[1] : "").slice(0, 60))}…”<br>
    <small>${ranked.length}절 · 점수순 · 단어가 없어도 원어 개념과 관주로 이어진 구절을 함께 보여 줍니다</small></span>`;
  await drawList();
  $("#reader").scrollIntoView({ block: "start" });
}
function ctxHelp() {
  const hist = store.get("chist", []);
  openSheet("맥락 검색 쓰는 법", `<dl class="kv help">
    <dt>잘 됨</dt><dd>명사·진술형 문장 — “남편을 사랑한다”, “나는 요즘 힘들다”, “교만”</dd>
    <dt>보통</dt><dd>질문형 — “교만한 사람은 누구인가”</dd>
    <dt>안 됨</dt><dd>장절 — “창 5:6” (빠른 검색을 쓰세요)</dd></dl>
    <p class="hint">핵심어가 들어 있는 구절을 먼저 찾고, 그 구절들에 공통으로 쓰인 히브리어·헬라어 단어(맥락 개념)와 관주를 따라 관련 구절을 더 찾아옵니다. 그래서 검색어가 직접 들어 있지 않은 구절도 나옵니다. 결과의 해석은 읽는 사람의 몫입니다.</p>
    ${hist.length ? `<h3 class="small">최근 맥락 검색</h3><div class="chips">${hist.map(x => `<button class="chip" type="button" data-cq="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}`);
}

// ---------- 한국어 약식 분해 (예: 동사-칼-완-3남단, 명사.여단여) ----------
const SHORT = [
  [/^칼/, "칼"], [/^니팔/, "닢"], [/^피엘/, "피"], [/^푸알/, "푸"], [/^히필/, "힢"], [/^호팔/, "홒"], [/^히트파엘/, "힡"],
  [/^와우 연속 미완료/, "와미"], [/^와우 연속 완료/, "와완"], [/^미완료/, "미완"], [/^완료/, "완"], [/^과거완료/, "과완"],
  [/^제2 부정과거|^부정과거/, "부과"], [/^현재/, "현"], [/^미래|^제2 미래/, "미"], [/^제2 완료/, "완"],
  [/^명령/, "명"], [/^부정사/, "부정사"], [/^수동 분사/, "수분"], [/^분사/, "분"], [/^직설법/, "직"], [/^가정법/, "가"], [/^희구법/, "희"],
  [/^능동/, "능"], [/^중간 또는 수동/, "중수"], [/^중간/, "중"], [/^수동/, "수"],
  [/^(\d)인칭/, "$1"], [/^남성/, "남"], [/^여성/, "여"], [/^중성/, "중"], [/^남·여/, "공"],
  [/^단수/, "단"], [/^복수/, "복"], [/^쌍수/, "쌍"], [/^연계형/, "연"],
  [/^주격/, "주"], [/^속격/, "속"], [/^여격/, "여"], [/^대격/, "대"], [/^호격/, "호"]
];
const POS_SHORT = { "접속사": "접속", "정관사": "관", "전치사": "전치사", "인칭 대명사": "인대", "접미 대명사": "접미", "목적격 표지(에트)": "목표", "부정 불변사": "부정", "관계 대명사": "관대", "지시 대명사": "지대" };
function kparse(code, morph) {
  if (!code) return "";
  return code.split("/").map(c => {
    const rows = morph[c]; if (!rows) return "";
    let pos = "";
    const bits = [];      // 어간·형태·시제 등은 따로, 인칭·성·수·격은 붙여 쓴다
    let pgn = "";
    for (const [k, v] of rows) {
      if (k === "품사") { pos = POS_SHORT[v] || v; continue; }
      if (k === "형태" && /보통|고유|칭호|한정|정관사/.test(v)) continue;
      if (k === "상태" && v.startsWith("절대")) continue;
      if (k === "고유명사" || k === "원어" || k === "참고") continue;
      const hit = SHORT.find(([re]) => re.test(v)); if (!hit) continue;
      const sv = v.replace(hit[0], hit[1]).replace(/[\s(].*$/, "");
      if (/^(인칭|성|수|격|상태)$/.test(k)) pgn += sv; else bits.push(sv);
    }
    const greek = !/^[HA]/.test(c);
    if (greek) return pos + (bits.join("") + pgn ? "." + bits.join("") + pgn : "");
    const tail = [...bits, pgn].filter(Boolean).join("-");
    return pos + (tail ? "-" + tail : "");
  }).filter(Boolean).join(" | ");
}

// ---------- 인터리니어 ----------
async function interHTML(b, c, v) {
  const lang = isOT(b) ? "he" : "gr";
  const [morph, lexG] = await Promise.all([loadMorph(), loadLex("G")]);
  let h = "";
  let ws = null;
  try { const o = await loadBook(b); ws = o[c] && o[c][v]; } catch {}
  if (ws && ws.length) {
    h += `<div class="ilin ${lang}" ${lang === "he" ? 'dir="rtl"' : ""}>`;
    for (const w of ws) {
      const i = state.words.push({ w, b, c, v }) - 1;
      h += `<button class="ib${w[6] === 2 ? " var" : ""}" type="button" data-w="${i}"><span class="ig">${esc(w[2])}</span><span class="iw">${esc(w[0])}</span><span class="it">${esc(w[1])}</span><span class="im">${esc(w[4])}</span><span class="ik">${esc(kparse(w[4], morph))}</span></button>`;
    }
    h += `</div>`;
  } else h += `<p class="small">원문이 연결되지 않은 절입니다.</p>`;
  if (lang === "he") {
    let lx = null;
    try { const L = await loadLxx(b); lx = L[c] && L[c][v]; } catch {}
    if (lx && lx.length) {
      h += `<p class="lxx-h">70인역 (Swete)</p><div class="ilin lx">`;
      for (const x of lx) {
        const i = state.words.push({ lxx: x, b, c, v }) - 1;
        const L = x[1] ? lexG[x[1]] : null;
        h += `<button class="ib" type="button" data-w="${i}"><span class="ig">${esc(L ? L[3] : "")}</span><span class="iw">${esc(x[0])}</span><span class="it">${esc(L ? L[0] : "")}</span><span class="im">${esc(x[2] || "")}</span><span class="ik">${esc(kparse(x[2], morph))}</span></button>`;
      }
      h += `</div>`;
    }
  }
  return h;
}

// 70인역 단어 상세
async function showLxxWord(i) {
  const { lxx, b, c, v } = state.words[i];
  const [surf, strong, mcode] = lxx;
  const [lexG, morph, concG] = await Promise.all([loadLex("G"), loadMorph(), loadConc("G").catch(() => ({}))]);
  let h = `<div class="big gr">${esc(surf)}</div><dl class="kv"><dt>본문</dt><dd>${esc(refStr(b, c, v))} (70인역)</dd></dl>`;
  if (!strong) {
    h += `<p class="hint">신약에 같은 형태가 없어 분해를 붙이지 못한 단어입니다.</p>`;
  } else {
    h += mcode ? `<p class="tip small"><b>추정</b> 신약에 같은 형태로 나오는 단어의 분해를 붙였습니다. 70인역 문맥에서는 다를 수 있습니다.</p>`
      : `<p class="tip small"><b>추정</b> 어간으로 사전 표제어만 연결했습니다. 문법 분해는 없습니다.</p>`;
    const rows = morph[mcode];
    if (rows) h += `<div class="card"><h3>문법 정보 <span class="small">${esc(mcode)}</span></h3><dl class="kv">${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl></div>`;
    h += lexCard(lexG, strong, "G", concG);
    h += `<div class="actions"><button class="btn" type="button" data-conc="${esc(strong)}">신약 용례 ${(concG[strong] || []).length}곳 보기</button></div>`;
  }
  openSheet(`${refStr(b, c, v)} · ${surf}`, h);
}

// ---------- TTS 패드 ----------
let ttsPaused = false;
function ttsPlay() {
  if (ttsPaused && speechSynthesis.paused) { speechSynthesis.resume(); ttsPaused = false; return; }
  const first = document.querySelector(".verse.hl")?.dataset.k;
  const keys = state.list.map(r => refKey(...r));
  speakKeys(first ? keys.filter(k => k >= +first) : keys);
}

// ---------- 필사 패드 ----------
function copyDone() { return new Set(store.get("copyDone", [])); }
function copyHTML(key, text) {
  const done = copyDone().has(key);
  return `<div class="copybox${done ? " ok" : ""}"><div class="ghost">${esc(text)}</div>
    <textarea class="copyin" data-k="${key}" rows="2" placeholder="여기에 따라 쓰세요" spellcheck="false">${done ? esc(text) : ""}</textarea>
    <p class="small copymsg">${done ? "필사 완료" : ""}</p></div>`;
}
function checkCopy(ta) {
  const key = +ta.dataset.k;
  const art = ta.closest(".verse"); const target = art.querySelector(".ghost").textContent;
  const typed = ta.value;
  const norm = s => s.replace(/\s+/g, " ").trim();
  let ok = 0; while (ok < typed.length && typed[ok] === target[ok]) ok++;
  const msg = art.querySelector(".copymsg");
  if (norm(typed) === norm(target)) {
    const d = copyDone(); d.add(key); store.set("copyDone", [...d]);
    art.querySelector(".copybox").classList.add("ok"); msg.textContent = "필사 완료";
  } else if (ok < typed.length) msg.textContent = `${ok + 1}번째 글자부터 본문과 다릅니다`;
  else msg.textContent = `${Math.round(typed.length / Math.max(1, target.length) * 100)}%`;
}

// ---------- 연간 읽기표 ----------
let PLAN = null;
async function buildPlan() {
  if (PLAN) return PLAN;
  const vc = await getJSON("data/vcount.json");
  const chs = []; let total = 0;
  vc.forEach((arr, bi) => arr.forEach((n, ci) => { chs.push([bi + 1, ci + 1, n]); total += n; }));
  const days = []; let acc = 0, cur = [];
  for (const ch of chs) {
    cur.push(ch); acc += ch[2];
    const target = total * (days.length + 1) / 365;
    if (acc >= target && days.length < 364) { days.push(cur); cur = []; }
  }
  if (cur.length) days.push(cur);
  return PLAN = days;
}
function dayLabel(chs) {
  const [b1, c1] = chs[0], [b2, c2] = chs[chs.length - 1];
  return b1 === b2 ? `${BOOKS[b1-1][1]} ${c1}${c2 !== c1 ? "-" + c2 : ""}` : `${BOOKS[b1-1][1]} ${c1} - ${BOOKS[b2-1][1]} ${c2}`;
}
function todayIndex() {
  const now = new Date(); const start = new Date(now.getFullYear(), 0, 1);
  return Math.min(364, Math.floor((now - start) / 86400000));
}
async function showPlan() {
  const days = await buildPlan();
  const done = new Set(store.get("planDone", []));
  const ti = todayIndex();
  const reader = $("#reader");
  $("#locText").textContent = "연간 읽기표";
  $("#info").innerHTML = `1년 1독 · ${done.size}/365일 읽음 · 오늘은 <b>${ti + 1}일째</b>`;
  let h = `<div class="headband"><span>1월 1일 시작 · 하루 약 85절</span><span>${Math.round(done.size / 3.65)}%</span></div><div class="plan">`;
  days.forEach((chs, i) => {
    const d = new Date(new Date().getFullYear(), 0, 1 + i);
    h += `<div class="pday${i === ti ? " today" : ""}${done.has(i) ? " done" : ""}" id="pd${i}">
      <button class="pchk" type="button" data-pchk="${i}" aria-pressed="${done.has(i)}" aria-label="${i + 1}일째 읽음 표시">${done.has(i) ? "✓" : ""}</button>
      <span class="pdate">${d.getMonth() + 1}/${d.getDate()}</span>
      <button class="pread" type="button" data-pday="${i}">${esc(dayLabel(chs))}</button></div>`;
  });
  reader.innerHTML = h + `</div>`;
  document.getElementById("pd" + ti)?.scrollIntoView({ block: "center" });
}
async function openPlanDay(i) {
  const days = await buildPlan();
  const list = [];
  for (const [b, c] of days[i]) list.push(...await versesOf(b, c));
  state.pad = "home"; store.set("pad", "home"); $("#padName").textContent = PADS.home[1];
  await showList(list, `${i + 1}일째 · ${dayLabel(days[i])}`);
}

// ---------- 시트 ----------
let sheetStack = [];
function openSheet(title, html, opts = {}) {
  if (opts.push && !$("#sheet").hidden) sheetStack.push([$("#sheetTitle").textContent, $("#sheetBody").innerHTML, $("#sheet").className]);
  else sheetStack = [];
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  $("#sheet").className = "sheet" + (opts.full ? " full" : "") + (opts.side ? " side" : "");
  if ($("#sheet").hidden) { try { history.pushState({ sheet: 1 }, ""); } catch {} }
  $("#sheet").hidden = false; $("#scrim").hidden = false;
  $("#sheetBody").scrollTop = 0;
  $("#sheetClose").textContent = sheetStack.length ? "←" : "✕";
}
function closeSheet() {
  if (sheetStack.length) {
    const [t, h, cls] = sheetStack.pop();
    $("#sheetTitle").textContent = t; $("#sheetBody").innerHTML = h; $("#sheet").className = cls;
    $("#sheetClose").textContent = sheetStack.length ? "←" : "✕";
    return;
  }
  if (history.state && history.state.sheet) { history.back(); return; }
  hideSheet();
}
function hideSheet() {
  $("#sheet").hidden = true; $("#scrim").hidden = true;
  document.querySelectorAll(".w.sel").forEach(e => e.classList.remove("sel"));
}

// ---------- 이벤트 ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("button, [data-act]");
  if (!t) return;
  const d = t.dataset;
  if (d.tool) {
    const key = +d.k, art = t.closest(".verse");
    if (d.tool === "note") return showNote(key);
    if (d.tool === "mark") return toggleMark(key);
    if (d.tool === "tts") return speakKeys(state.list.map(r => refKey(...r)).filter(k => k >= key));
    if (d.tool === "copy") {
      const [b, c, v] = fromKey(key); const k = await korText(b, c, v);
      let txt = k ? k.x : ""; if (!txt) { try { txt = (await loadEn(b))[c][v]; } catch {} }
      try { await navigator.clipboard.writeText(`${txt} (${refStr(b, c, v)})`); toast("복사했습니다"); } catch { toast("복사가 막혀 있습니다"); }
      return;
    }
    return togglePanel(art, d.tool, key);
  }
  if (d.w !== undefined) return showWord(+d.w);
  if (d.cq) { sheetStack = []; hideSheet(); $("#ctxq").value = d.cq; return ctxSearch(d.cq); }
  if (d.comm) {
    store.set("comm", d.comm);
    if (d.scope === "panel") { const art = t.closest(".verse"); const box = t.closest(".panel"); box.remove(); return togglePanel(art, "comm", +art.dataset.k, true); }
    return drawList();
  }
  if (d.pad) {
    sheetStack = []; hideSheet();
    if (d.pad === "notes") return showNotes("notes");
    if (d.pad === "marks") return showNotes("marks");
    return setPad(d.pad);
  }
  if (d.pchk !== undefined) {
    const i = +d.pchk, done = new Set(store.get("planDone", []));
    done.has(i) ? done.delete(i) : done.add(i); store.set("planDone", [...done]);
    return showPlan();
  }
  if (d.pday !== undefined) return openPlanDay(+d.pday);
  if (d.lex) return showLex(d.lex);
  if (d.conc) return showConc(d.conc);
  if (d.go) { const [b, c, v] = d.go.split(".").map(Number); return go(b, c, v); }
  if (d.q) { sheetStack = []; hideSheet(); $("#quick").value = d.q; return quickSearch(d.q); }
  if (d.pickb) return showPicker(+d.pickb);
  if (d.pickc) { const [b, c] = d.pickc.split(".").map(Number); return go(b, c); }
  if (d.ntab) return showNotes(d.ntab);
  if (d.cf) {
    concState.filter = d.cf;
    document.querySelectorAll("[data-cf]").forEach(x => x.setAttribute("aria-pressed", String(x === t)));
    return drawConc(true);
  }
  if (d.savenote) return saveNote(+d.savenote);
  if (d.delnote) return delNote(+d.delnote);
  if (d.addword !== undefined) {
    const { w, b, c, v } = state.words[+d.addword];
    const lang = isOT(b) ? "H" : "G";
    const [lex, morph] = await Promise.all([loadLex(lang), loadMorph()]);
    const L = lex[w[3]];
    const mtxt = (w[4] || "").split("/").map(code => (morph[code] || []).map(r => r[1]).join(" ")).filter(Boolean).join(" + ");
    return showNote(refKey(b, c, v), `- ${w[0]} (${w[1]}) · ${L ? L[0] + " " : ""}${w[3]} · ${L ? L[3] : w[2]}${mtxt ? " · " + mtxt : ""}`);
  }
  switch (d.act || t.id) {
    case "prev": return step(-1);
    case "next": return step(1);
    case "loc": return showPicker();
    case "btnTop": window.scrollTo({ top: 0 }); return $("#quick").focus();
    case "btnNotes": return showNotes();
    case "btnTheme": state.theme = state.theme === "dark" ? "light" : "dark"; store.set("theme", state.theme); document.documentElement.dataset.theme = state.theme; return;
    case "btnSettings": return showMenu();
    case "settings": sheetStack = []; return showSettings();
    case "ttsPlay": return ttsPlay();
    case "ttsPause": if (speechSynthesis.speaking) { speechSynthesis.pause(); ttsPaused = true; } return;
    case "ttsStop": ttsQueue = []; speechSynthesis.cancel(); ttsPaused = false; document.querySelectorAll(".verse.hl").forEach(e => e.classList.remove("hl")); return;
    case "sheetClose": return closeSheet();
    case "quickHelp": return showHelp();
    case "ctxHelp": return ctxHelp();
    case "rangeGo": return rangeSearch();
    case "resetBtn": speechSynthesis?.cancel?.(); $("#kw").value = ""; $("#quick").value = ""; return showChapter(state.b, state.c);
    case "fsDown": case "fsUp": state.fs = Math.min(30, Math.max(14, state.fs + (t.id === "fsUp" ? 1 : -1))); store.set("fs", state.fs); return applyFs();
    case "allOrig": case "allEn": case "glossBtn": {
      const k = { allOrig: "allOrig", allEn: "allEn", glossBtn: "gloss" }[t.id];
      state[k] = !state[k]; store.set(k, state[k]); t.setAttribute("aria-pressed", String(state[k]));
      return drawList();
    }
    case "showmarks": { sheetStack = []; hideSheet(); const list = [...state.marks].sort((a, b) => a - b).map(fromKey); return showList(list, "북마크"); }
    case "moredef": { const el = $("#def"); if (el) { el.classList.toggle("open"); t.textContent = el.classList.contains("open") ? "접기" : "전체 보기"; } return; }
    case "concmore": return drawConc(false);
    case "commmore": { const el = t.closest(".comm").querySelector(".comm-text"); el.classList.toggle("clip"); t.textContent = el.classList.contains("clip") ? "전체 보기" : "접기"; return; }
    case "export": return exportNotes();
    case "copymd": return copyMarkdown();
    case "offline": return saveOffline();
    case "delkor": {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "한 번 더 누르면 지웁니다"; return; }
      await idb.clear("kor"); await idb.del("meta", "kor"); korCache.clear(); state.hasKor = false;
      toast("한글 본문을 지웠습니다"); sheetStack = []; closeSheet(); return showChapter(state.b, state.c);
    }
  }
});
$("#scrim").addEventListener("click", () => { sheetStack = []; closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
$("#quickForm").addEventListener("submit", e => { e.preventDefault(); $("#quick").blur(); quickSearch($("#quick").value); });
$("#ctxForm").addEventListener("submit", e => { e.preventDefault(); $("#ctxq").blur(); ctxSearch($("#ctxq").value); });
$("#kw").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); rangeSearch(); } });
document.addEventListener("change", e => {
  const id = e.target.id;
  if (id === "bdbFile" && e.target.files[0]) return importBdb(e.target.files[0]);
  // 책을 바꾸면 장·절은 비움(책 전체), 장을 바꾸면 절은 비움(장 전체)
  if (id === "b1" || id === "c1") return fillCV($("#b1"), $("#c1"), $("#v1"), id === "b1" ? 0 : +$("#c1").value, 0);
  if (id === "b2" || id === "c2") return fillCV($("#b2"), $("#c2"), $("#v2"), id === "b2" ? 0 : +$("#c2").value, 0);
  if (id === "ttsRate" || id === "ttsRate2") { store.set("ttsRate", +e.target.value); if ($("#ttsRate2")) $("#ttsRate2").value = e.target.value; }
});
document.addEventListener("input", e => {
  if (e.target.classList.contains("copyin")) return checkCopy(e.target);
  if (e.target.id === "fs") { state.fs = +e.target.value; store.set("fs", state.fs); applyFs(); $("#fsv").textContent = state.fs + "px"; }
});
window.addEventListener("popstate", () => { if (!$("#sheet").hidden) { sheetStack = []; hideSheet(); } });
function applyFs() { document.documentElement.style.setProperty("--fs", state.fs + "px"); }

// ---------- 시작 ----------
(async function start() {
  document.documentElement.dataset.theme = state.theme;
  const m = location.hash.match(/^#(\d+)-(\d+)$/);
  if (m && +m[1] >= 1 && +m[1] <= 66) { state.b = +m[1]; state.c = +m[2]; }
  if (state.c > BOOKS[state.b-1][2]) state.c = 1;
  applyFs();
  $("#allOrig").setAttribute("aria-pressed", String(state.allOrig));
  $("#allEn").setAttribute("aria-pressed", String(state.allEn));
  $("#glossBtn").setAttribute("aria-pressed", String(state.gloss));
  try { state.hasKor = !!(await idb.get("meta", "kor")); await loadNotes(); } catch (e) { console.warn(e); }
  $("#padName").textContent = (PADS[state.pad] || PADS.home)[1];
  $("#ttsBar").hidden = state.pad !== "tts";
  $("#ttsRate2").value = String(store.get("ttsRate", 1));
  await showChapter(state.b, state.c);
  window.scrollTo(0, 0);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
