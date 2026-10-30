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
  view: store.get("view", "both"), gloss: store.get("gloss", false),
  fs: store.get("fs", 18), hasKor: false, notes: new Map(), words: []
};

// ---------- 본문 그리기 ----------
async function render(scrollTo) {
  const { b, c } = state;
  store.set("b", b); store.set("c", c);
  history.replaceState(null, "", `#${b}-${c}`);
  $("#loc").textContent = `${BOOKS[b-1][0]} ${c}`;
  document.title = `${refStr(b, c)} · 원어서재`;
  const reader = $("#reader");
  reader.className = `view-${state.view}${state.gloss ? " show-gloss" : ""}`;
  reader.innerHTML = `<p class="small">불러오는 중…</p>`;
  let orig = null, kor = null;
  try { orig = await loadBook(b); } catch { /* 오프라인이면서 아직 저장 안 된 책 */ }
  kor = await loadKor(b);
  if (state.b !== b || state.c !== c) return; // 그 사이 다른 장으로 이동함
  const och = orig ? orig[c] || {} : {};
  const kch = kor ? kor[c] || {} : {};
  const verseNums = new Set([...Object.keys(och), ...Object.keys(kch)].map(Number));
  const nums = [...verseNums].sort((x, y) => x - y);
  const lang = isOT(b) ? "he" : "gr";
  state.words = [];
  let html = "";
  if (!state.hasKor) {
    html += `<div class="notice"><b>개역개정 본문이 아직 없습니다.</b><span>설정에서 갖고 계신 성경 파일(.bdb)을 한 번 불러오면 원어와 나란히 볼 수 있습니다. 파일은 이 휴대폰 안에만 저장됩니다.</span><div><button class="btn" type="button" data-act="settings">파일 불러오기</button></div></div>`;
  }
  if (!orig) html += `<div class="notice"><b>원어 데이터를 불러오지 못했습니다.</b><span>인터넷에 연결된 상태에서 한 번 열면 이 책이 저장됩니다.</span></div>`;
  html += `<h1 class="chap-title">${esc(BOOKS[b-1][0])} ${c}장</h1>`;
  for (const v of nums) {
    const ws = och[v];
    const k = kch[v];
    const noteOn = state.notes.has(refKey(b, c, v));
    html += `<article class="verse" id="v${v}"><div class="vk"><button class="vn${noteOn ? " has-note" : ""}" type="button" data-note="${v}" aria-label="${v}절 노트">${v}</button>`;
    if (k) {
      if (k.t) html += `<span class="vk-text ps-title">${esc(k.t)}</span>`;
      html += `<span class="vk-text">${esc(k.x)}</span>`;
    }
    html += `</div>`;
    if (ws && ws.length) {
      html += `<div class="vo ${lang}" ${lang === "he" ? 'dir="rtl" lang="he"' : 'lang="grc"'}>`;
      for (const w of ws) {
        const i = state.words.push({ w, v }) - 1;
        const cls = "w" + (w[6] === 2 ? " var" : "") + (w[6] === 1 ? " ttl" : "");
        html += `<button class="${cls}" type="button" data-w="${i}">${w[6] === 2 ? "[" + esc(w[0]) + "]" : esc(w[0])}<span class="g">${esc(w[2])}</span></button>`;
      }
      html += `</div>`;
    } else if (orig) {
      html += `<p class="no-orig">이 절은 원어 데이터의 장절 구분이 달라 원문이 연결되지 않았습니다.</p>`;
    }
    html += `</article>`;
  }
  const last = BOOKS[b-1][2];
  html += `<nav class="chap-nav"><button type="button" data-act="prev">‹ 이전 장</button><button type="button" data-act="next">다음 장 ›</button></nav>`;
  reader.innerHTML = html;
  if (scrollTo) {
    const el = document.getElementById("v" + scrollTo);
    if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center" }); setTimeout(() => el.classList.remove("hl"), 2500); }
  } else window.scrollTo(0, 0);
  $("#prev").disabled = b === 1 && c === 1;
  $("#next").disabled = b === 66 && c === last;
}

function go(b, c, v) {
  state.b = b; state.c = Math.min(Math.max(1, c), BOOKS[b-1][2]);
  sheetStack = []; hideSheet();
  render(v);
}
function step(d) {
  let { b, c } = state; c += d;
  if (c < 1) { if (b === 1) return; b--; c = BOOKS[b-1][2]; }
  if (c > BOOKS[b-1][2]) { if (b === 66) return; b++; c = 1; }
  go(b, c);
}

// ---------- 시트 ----------
let sheetStack = [];
function openSheet(title, html, opts = {}) {
  if (opts.push && !$("#sheet").hidden) sheetStack.push([$("#sheetTitle").textContent, $("#sheetBody").innerHTML, $("#sheet").className]);
  else sheetStack = [];
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  $("#sheet").className = "sheet" + (opts.full ? " full" : "");
  if ($("#sheet").hidden) { try { history.pushState({ sheet: 1 }, ""); } catch {} }
  $("#sheet").hidden = false; $("#scrim").hidden = false;
  $("#sheetBody").scrollTop = 0;
  $("#sheetClose").textContent = sheetStack.length ? "←" : "✕";
  $("#sheetClose").setAttribute("aria-label", sheetStack.length ? "뒤로" : "닫기");
}
function closeSheet() {
  if (sheetStack.length) {
    const [t, h, cls] = sheetStack.pop();
    $("#sheetTitle").textContent = t; $("#sheetBody").innerHTML = h; $("#sheet").className = cls;
    $("#sheetClose").textContent = sheetStack.length ? "←" : "✕";
    return;
  }
  if (history.state && history.state.sheet) { history.back(); return; } // popstate에서 닫힘
  hideSheet();
}
function hideSheet() {
  $("#sheet").hidden = true; $("#scrim").hidden = true;
  document.querySelectorAll(".w.sel").forEach(e => e.classList.remove("sel"));
}

// ---------- 단어 상세 ----------
const MORPH_NOTE = "문법 정보";
async function showWord(i) {
  const { w, v } = state.words[i];
  document.querySelectorAll(".w.sel").forEach(e => e.classList.remove("sel"));
  document.querySelector(`.w[data-w="${i}"]`)?.classList.add("sel");
  const lang = isOT(state.b) ? "H" : "G";
  const [lex, morph, conc] = await Promise.all([loadLex(lang), loadMorph(), loadConc(lang).catch(() => ({}))]);
  const [surf, translit, eng, main, mcode, segs, flag] = w;
  const cls = lang === "H" ? "he" : "gr";
  let h = `<div class="big ${cls}">${esc(surf)}</div>`;
  h += `<dl class="kv"><dt>음역</dt><dd>${esc(translit) || "—"}</dd><dt>문맥 번역</dt><dd>${esc(eng) || "—"}</dd><dt>본문</dt><dd>${esc(refStr(state.b, state.c, v))}</dd></dl>`;
  if (flag === 2) h += `<p class="hint">이 단어는 NA28 비평본문에는 없고 공인본문(TR)에만 있는 이형입니다. 개역개정에서 괄호로 표시된 구절과 관련될 수 있습니다.</p>`;
  if (lang === "H" && segs.length > 1) {
    h += `<div class="card"><h3>단어 분해</h3><div class="segs">`;
    segs.forEach(([t, s]) => {
      const L = lex[s];
      h += `<button class="seg${s === main ? " main" : ""}" type="button" data-lex="${esc(s)}"><span class="he">${esc(t)}</span><small>${esc(s)} · ${esc(L ? L[3] : "")}</small></button>`;
    });
    h += `</div></div>`;
  }
  // 문법
  const parts = (mcode || "").split("/").filter(Boolean);
  const mrows = parts.map(code => morph[code]).filter(Boolean);
  if (mrows.length) {
    h += `<div class="card"><h3>${MORPH_NOTE} <span class="small">${esc(mcode)}</span></h3>`;
    mrows.forEach((rows, idx) => {
      if (mrows.length > 1) h += `<p class="small">${idx + 1}번째 조각</p>`;
      h += `<dl class="kv">${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>`;
    });
    h += `</div>`;
  }
  h += lexCard(lex, main, lang, conc);
  h += `<div class="actions"><button class="btn" type="button" data-conc="${esc(main)}">용례 ${(conc[main] || []).length}곳 보기</button><button class="btn ghost" type="button" data-addword="${i}">노트에 담기</button></div>`;
  openSheet(`${refStr(state.b, state.c, v)} · ${surf}`, h);
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

// ---------- 노트 ----------
async function loadNotes() {
  state.notes = new Map((await idb.all("notes")).map(([k, v]) => [k, v]));
}
async function showNote(v, append) {
  const { b, c } = state, key = refKey(b, c, v);
  const n = state.notes.get(key);
  const k = await loadKor(b);
  const kt = k && k[c] && k[c][v] ? k[c][v].x : "";
  let text = n ? n.text : "";
  if (append) text = (text ? text.replace(/\s+$/, "") + "\n" : "") + append;
  const h = `${kt ? `<p class="txt" style="font-family:var(--f-ko)">${esc(kt)}</p>` : ""}
    <div class="field"><label for="noteText">묵상 · 연구 메모</label><textarea id="noteText">${esc(text)}</textarea></div>
    <div class="actions"><button class="btn" type="button" data-savenote="${key}">저장</button>${n ? `<button class="btn plain" type="button" data-delnote="${key}">삭제</button>` : ""}</div>
    <p class="hint">단어 상세 화면의 "노트에 담기"를 누르면 원어 정보가 이 메모에 한 줄씩 추가됩니다.</p>`;
  openSheet(`노트 · ${refStr(b, c, v)}`, h, { push: !!append });
  if (append) toast("단어를 메모에 담았습니다. 저장을 눌러 주세요.");
}
async function saveNote(key) {
  const text = $("#noteText").value.trim();
  if (!text) return delNote(key);
  const n = { text, updated: Date.now() };
  await idb.put("notes", key, n); state.notes.set(key, n);
  sheetStack = []; closeSheet(); toast("저장했습니다");
  markNotes();
}
async function delNote(key) {
  await idb.del("notes", key); state.notes.delete(key);
  sheetStack = []; closeSheet(); toast("노트를 지웠습니다");
  markNotes();
}
function markNotes() {
  document.querySelectorAll(".vn").forEach(el => el.classList.toggle("has-note", state.notes.has(refKey(state.b, state.c, +el.dataset.note))));
}
async function showNotes() {
  const items = [...state.notes.entries()].sort((a, b) => a[0] - b[0]);
  let h = `<div class="actions"><button class="btn" type="button" data-act="export" ${items.length ? "" : "disabled"}>말씀서재로 내보내기 (.md)</button><button class="btn ghost" type="button" data-act="copymd" ${items.length ? "" : "disabled"}>마크다운 복사</button></div>`;
  if (!items.length) h += `<p class="hint">아직 노트가 없습니다. 본문에서 절 번호를 누르면 메모를 남길 수 있습니다.</p>`;
  h += `<div class="list">`;
  for (const [k, n] of items) {
    const [b, c, v] = fromKey(k);
    h += `<button class="item" type="button" data-go="${b}.${c}.${v}"><span class="ref">${esc(refStr(b, c, v))}</span><span class="txt">${esc(n.text.slice(0, 120))}${n.text.length > 120 ? "…" : ""}</span></button>`;
  }
  openSheet(`노트 ${items.length}개`, h + `</div>`, { full: true });
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

// ---------- 찾기 ----------
function parseRef(q) {
  const m = q.trim().replace(/\s+/g, " ").match(/^(\d?\s?[가-힣]+)\s?(\d+)?(?:[:장\s]\s?(\d+))?절?$/);
  if (!m) return null;
  const name = m[1].replace(/\s/g, "");
  let b = BOOKS.findIndex(x => x[1] === name || x[0] === name) + 1;
  // 숫자 없이 책 이름 일부만 쓴 경우(예: "전도")는 단어 검색으로 본다
  if (!b && m[2]) b = BOOKS.findIndex(x => x[0].startsWith(name)) + 1;
  if (!b) return null;
  return [b, +(m[2] || 1), m[3] ? +m[3] : 0];
}
function showSearch() {
  const h = `<form id="searchForm" class="field"><label for="q">장절(예: 요 3:16, 시 23) 또는 한글 단어</label>
    <input type="search" id="q" autocomplete="off" enterkeyhint="search" placeholder="요 3:16"></form>
    <p class="hint">한글 단어 검색은 개역개정을 불러온 뒤에 됩니다. 여러 단어는 띄어 쓰면 모두 들어간 절을 찾습니다.</p>
    <div class="list" id="results"></div>`;
  openSheet("찾기", h, { full: true });
  setTimeout(() => $("#q")?.focus(), 50);
}
async function runSearch(q) {
  const r = parseRef(q);
  if (r && (r[1] <= BOOKS[r[0]-1][2])) return go(r[0], r[1], r[2]);
  const out = $("#results");
  if (!state.hasKor) { out.innerHTML = `<p class="hint">장절 형식이 아니고, 한글 본문이 아직 없어 단어로 찾을 수 없습니다.</p>`; return; }
  const terms = q.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return;
  out.innerHTML = `<p class="small">찾는 중…</p>`;
  const hits = [];
  for (let b = 1; b <= 66 && hits.length < 500; b++) {
    const k = await loadKor(b); if (!k) continue;
    for (const c of Object.keys(k)) for (const v of Object.keys(k[c])) {
      const x = k[c][v].x;
      if (terms.every(t => x.includes(t))) hits.push([b, +c, +v, x]);
    }
  }
  hits.sort((a, z) => refKey(a[0], a[1], a[2]) - refKey(z[0], z[1], z[2]));
  const re = new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  out.innerHTML = `<p class="small">${hits.length >= 500 ? "500절 이상" : hits.length + "절"}</p>` +
    hits.slice(0, 500).map(([b, c, v, x]) => `<button class="item" type="button" data-go="${b}.${c}.${v}"><span class="ref">${esc(refStr(b, c, v))}</span><span class="txt">${esc(x).replace(re, m => `<mark>${m}</mark>`)}</span></button>`).join("");
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
    <p class="hint">지금은 읽은 책만 저장됩니다. 와이파이에서 한 번 눌러 두면 인터넷 없이 모든 기능을 쓸 수 있습니다 (약 15MB 전송).</p>
    <div><button class="btn ghost" type="button" data-act="offline">전체 원어 데이터 저장</button></div>
    <div class="progress" hidden id="offProg"><span></span></div><p class="small" id="offMsg"></p></div>
  <div class="card"><h3>글자 크기</h3><div class="row"><input type="range" id="fs" min="14" max="26" step="1" value="${state.fs}" style="flex:1"><span id="fsv">${state.fs}px</span></div></div>
  <div class="card"><h3>자료 출처</h3>
    <p class="small">히브리어·헬라어 원문, 스트롱 번호, 문법 분해, 사전: <b>STEPBible.org</b> (Tyndale House, Cambridge) 데이터, CC BY 4.0. 헬라어 본문은 NA28 기준이며 공인본문(TR)에만 있는 단어는 [괄호]로 흐리게 표시합니다.</p>
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
    render();
  } catch (e) {
    msg.textContent = "불러오지 못했습니다: " + e.message; bar.style.width = "0";
  }
}

async function saveOffline() {
  const msg = $("#offMsg"), prog = $("#offProg"), bar = prog.querySelector("span");
  prog.hidden = false;
  const files = ["data/morph.json", "data/lex/H.json", "data/lex/G.json", "data/conc/H.json", "data/conc/G.json"];
  for (let b = 1; b <= 66; b++) files.push(`data/books/${String(b).padStart(2, "0")}.json`);
  let done = 0, fail = 0;
  for (const f of files) {
    try { const r = await fetch(f); if (!r.ok) fail++; await r.arrayBuffer(); } catch { fail++; }
    done++; bar.style.width = (done / files.length * 100) + "%"; msg.textContent = `${done} / ${files.length}`;
  }
  msg.textContent = fail ? `${fail}개를 받지 못했습니다. 다시 눌러 주세요.` : "모두 저장했습니다. 이제 인터넷 없이 쓸 수 있습니다.";
}

// ---------- 이벤트 ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("button, [data-act]");
  if (!t) return;
  const d = t.dataset;
  if (d.w !== undefined) return showWord(+d.w);
  if (d.note !== undefined) return showNote(+d.note);
  if (d.lex) return showLex(d.lex);
  if (d.conc) return showConc(d.conc);
  if (d.go) { const [b, c, v] = d.go.split(".").map(Number); sheetStack = []; return go(b, c, v); }
  if (d.pickb) return showPicker(+d.pickb);
  if (d.pickc) { const [b, c] = d.pickc.split(".").map(Number); return go(b, c); }
  if (d.cf) {
    concState.filter = d.cf;
    document.querySelectorAll("[data-cf]").forEach(x => x.setAttribute("aria-pressed", String(x === t)));
    return drawConc(true);
  }
  if (d.savenote) return saveNote(+d.savenote);
  if (d.delnote) return delNote(+d.delnote);
  if (d.addword !== undefined) {
    const { w, v } = state.words[+d.addword];
    const lang = isOT(state.b) ? "H" : "G";
    const [lex, morph] = await Promise.all([loadLex(lang), loadMorph()]);
    const L = lex[w[3]];
    const mtxt = (w[4] || "").split("/").map(c => (morph[c] || []).map(r => r[1]).join(" ")).filter(Boolean).join(" + ");
    const line = `- ${w[0]} (${w[1]}) · ${L ? L[0] + " " : ""}${w[3]} · ${L ? L[3] : w[2]}${mtxt ? " · " + mtxt : ""}`;
    return showNote(v, line);
  }
  if (d.view) {
    state.view = d.view; store.set("view", d.view);
    document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", String(x === t)));
    $("#reader").className = `view-${state.view}${state.gloss ? " show-gloss" : ""}`;
    return;
  }
  switch (d.act || t.id) {
    case "prev": return step(-1);
    case "next": return step(1);
    case "loc": return showPicker();
    case "btnSearch": return showSearch();
    case "btnNotes": return showNotes();
    case "btnSettings": case "settings": return showSettings();
    case "sheetClose": return closeSheet();
    case "moredef": { const el = $("#def"); if (el) { el.classList.toggle("open"); t.textContent = el.classList.contains("open") ? "접기" : "전체 보기"; } return; }
    case "concmore": return drawConc(false);
    case "export": return exportNotes();
    case "copymd": return copyMarkdown();
    case "offline": return saveOffline();
    case "delkor": {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "한 번 더 누르면 지웁니다"; return; }
      await idb.clear("kor"); await idb.del("meta", "kor"); korCache.clear(); state.hasKor = false;
      toast("한글 본문을 지웠습니다"); sheetStack = []; closeSheet(); return render();
    }
  }
});
$("#scrim").addEventListener("click", () => { sheetStack = []; closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
document.addEventListener("submit", e => { if (e.target.id === "searchForm") { e.preventDefault(); runSearch($("#q").value); } });
document.addEventListener("change", e => { if (e.target.id === "bdbFile" && e.target.files[0]) importBdb(e.target.files[0]); });
document.addEventListener("input", e => {
  if (e.target.id === "fs") { state.fs = +e.target.value; store.set("fs", state.fs); applyFs(); $("#fsv").textContent = state.fs + "px"; }
});
$("#glossToggle").addEventListener("change", e => { state.gloss = e.target.checked; store.set("gloss", state.gloss); $("#reader").classList.toggle("show-gloss", state.gloss); });
// 휴대폰 뒤로 가기 버튼으로 시트 닫기
window.addEventListener("popstate", () => { if (!$("#sheet").hidden) { sheetStack = []; hideSheet(); } });
function applyFs() { document.documentElement.style.setProperty("--fs", state.fs + "px"); }

// ---------- 시작 ----------
(async function start() {
  const m = location.hash.match(/^#(\d+)-(\d+)$/);
  if (m && +m[1] >= 1 && +m[1] <= 66) { state.b = +m[1]; state.c = +m[2]; }
  if (state.c > BOOKS[state.b-1][2]) state.c = 1;
  applyFs();
  $("#glossToggle").checked = state.gloss;
  document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.view === state.view)));
  try { state.hasKor = !!(await idb.get("meta", "kor")); await loadNotes(); } catch (e) { console.warn(e); }
  render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
