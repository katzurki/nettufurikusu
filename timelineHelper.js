//HELPER SCRIPT for Netflix Originator Project Timeline function in AutoQC. Temporary solution so as not to mess with the template. 
function shapeLabel(key, {
  smallWords = new Set(["a","an","the","and","but","or","nor","for","so","yet","at","by","in","of","on","to","up","off","as","via","from"]),
  forceAcronyms = new Set(["ID","QC","DTT","SMPTE"]) // extend as needed
} = {}) {
  if (typeof key !== "string" || !key.trim()) return "";

  const segments = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const out = [];

  for (const seg of segments) {
    const s = seg;
    let pos = 0;                            // consumed up to this index in seg
    const tokens = [];
    const lc = /[a-z]+/g;                   // lowercase runs only
    let m;

    // helper: flush 2+ uppercase runs and digit runs in [start, end)
    const flushBetween = (start, end) => {
      let i = start;
      while (i < end) {
        if (/[A-Z]/.test(s[i])) {
          let j = i;
          while (j < end && /[A-Z]/.test(s[j])) j++;
          const run = s.slice(i, j);
          if (run.length >= 2) tokens.push(run); // abbreviations only if 2+
          i = j;
        } else if (/\d/.test(s[i])) {
          let j = i;
          while (j < end && /\d/.test(s[j])) j++;
          tokens.push(s.slice(i, j));            // keep number blocks
          i = j;
        } else {
          i++;
        }
      }
    };

    while ((m = lc.exec(s))) {
      const a = m.index, b = a + m[0].length;

      // find nearest uppercase to the left within the segment portion not yet consumed
      let j = -1;
      for (let k = a - 1; k >= pos; k--) {
        if (/[A-Z]/.test(s[k])) { j = k; break; }
      }

      // anything between pos and j (exclusive) may contain leftover 2+ caps — abbreviations
      if (j > pos) flushBetween(pos, j);

      // build the word
      let word;
      if (j >= pos && j !== -1) {
        word = s[j] + m[0];                  // Upper + lowercase run
      } else {
        // no uppercase to the left -> TitleCase the run itself
        word = m[0][0].toUpperCase() + m[0].slice(1);
      }
      tokens.push(word);

      // mark consumed up to end of the lowercase run
      pos = b;
    }

    // trailing leftovers after last lowercase run
    if (pos < s.length) flushBetween(pos, s.length);

    // post-process: title-case small words (except first/last), and force acronyms
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const isAcronym = /^[A-Z0-9]{2,}$/.test(t) || forceAcronyms.has(t.toUpperCase());
      const isFirst = i === 0, isLast = i === tokens.length - 1;

      if (isAcronym) {
        tokens[i] = t.toUpperCase();
      } else {
        const lower = t.toLowerCase();
        if (!isFirst && !isLast && smallWords.has(lower)) {
          tokens[i] = lower;                 // small word
        } else {
          tokens[i] = lower[0].toUpperCase() + lower.slice(1);
        }
      }
    }

    out.push(tokens.join(" "));
  }

  // join segments with spaces
  return out.join(" ");
}

function formatNotes(root = document) {
  ensureNoteStyles();
  const hasShape = typeof window.shapeLabel === "function";

  root.querySelectorAll(".note-item").forEach(item => {
    const field = item.querySelector(".note-field");
    const change = item.querySelector(".note-change");
    if (!field || !change) return;

    // --- (original) Apply shapeLabel() to the field text ---
    const raw = field.textContent.trim();
    const hadColon = /:\s*$/.test(raw);
    const base = raw.replace(/:\s*$/, "");
    const shaped = hasShape ? window.shapeLabel(base) : base;
    field.textContent = hadColon ? `${shaped}:` : shaped;

    // --- (original) Put field + change on one line (flex row) ---
    let row = change.parentElement;
    while (row && !row.contains(field)) row = row.parentElement;
    if (!row) return;
    row.style.display = "flex";
    row.style.alignItems = "baseline";
    row.style.gap = ".5rem";
    row.style.whiteSpace = "nowrap";

    // --- (new) Make JSON note-values expandable ---
    change.querySelectorAll(".note-value").forEach(span => {
      if (span.dataset.expandInit === "1") return; // idempotent
      const txt = span.textContent.trim();
      if (!/^\{[\s\S]*\}$/.test(txt)) return;

      let obj;
      try { obj = JSON.parse(txt); } catch { obj = null; }
      if (!obj || Array.isArray(obj) || typeof obj !== "object") return;

      makeExpandable(span, obj, { hasShape });
      span.dataset.expandInit = "1";
    });
  });

  // --- helpers ---
  function makeExpandable(span, obj, { hasShape }) {
    const container = span.closest(".note-change") || span.parentElement;

    // tiny "+/-" toggle
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "note-toggle";
    toggle.textContent = "";
    toggle.setAttribute("aria-expanded", "false");
    toggle.title = "Expand";

    // place before the span so it's visually next to the value
    span.prepend(toggle);
    span.classList.add("note-expandable");

    let tableEl = null;

    const renderTable = () => {
      const table = document.createElement("table");
      table.className = "note-json-table";
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);

      Object.entries(obj).forEach(([k, v]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.className = "note-json-key";
        th.textContent = hasShape ? window.shapeLabel(k) : k;

        const td = document.createElement("td");
        if (v !== null && typeof v === "object") {
          const pre = document.createElement("pre");
          pre.className = "note-json-pre";
          pre.textContent = JSON.stringify(v, null, 2);
          td.appendChild(pre);
        } else {
          td.textContent = String(v);
        }
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });

      return table;
    };

    const outsideHandler = (e) => {
      if (container.contains(e.target)) return;
      close();
    };

    const open = () => {
      if (tableEl) return;
      tableEl = renderTable();
	if (span.classList.contains("prev")) {
	  tableEl.classList.add("note-json-prev");
	}
      // Show table below the inline value; hide the raw text while expanded
      span.style.display = "none";
      container.appendChild(tableEl);
      toggle.setAttribute("aria-expanded", "true");
      // allow wrapping inside the flex row while expanded
      container.style.setProperty("--note-row-ws", "normal");
      document.addEventListener("click", outsideHandler);
    };

    const close = () => {
      if (!tableEl) return;
      tableEl.remove();
      tableEl = null;
      span.style.display = "";
      toggle.setAttribute("aria-expanded", "false");
      container.style.removeProperty("--note-row-ws");
      document.removeEventListener("click", outsideHandler);
    };

    const toggleHandler = (e) => {
      e.stopPropagation();
      tableEl ? close() : open();
    };

    toggle.addEventListener("click", toggleHandler);
    span.addEventListener("click", toggleHandler);
  }

//Small hack, easiest way
for (tx of $$("span.note-field")) {tx.textContent = tx.textContent+":"};
for (tg of $$("span.note-value")) {if (!tg.textContent.includes('{')) {tg.textContent=tg.textContent.replace(/^["]|["]$/g, '')}}
for (a of $$("span.note-expandable")){a.click();}
}

function ensureNoteStyles() {
  if (document.getElementById("note-json-styles")) return;
  const css = `
.note-json-table.note-json-prev {
  filter: brightness(0.6);
}
td.cell-notes {
  /* force single line + clipping + ellipsis */
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;

  /* cap the cell so it never pushes past the viewport */
  width: min(60vw, 800px) !important;   /* pick your cap */
  max-width: 100vw !important;
  box-sizing: border-box;
}
.note-expandable { cursor: pointer; display: inline-flex; align-items: center; gap: .25rem; position: relative; padding-left: .75em; }
.note-toggle { position:absolute; top:0; left:0; display:inline-block; width:.5em; height:.5em; line-height:1;text-align:center; border:1px solid rgba(0,0,0,.4); border-radius:2px; font-size:.5em; padding:0; margin:0;background:#eee; color:#000; cursor:pointer; user-select:none; }
.note-json-table { border:1px solid #9ca3af; border-collapse: collapse; margin-top:.25rem; white-space: normal; }
.note-json-table th, .note-json-table td { border:1px solid #9ca3af; padding:.25rem .5rem; vertical-align: top; }
.note-json-key { white-space: nowrap;  text-overflow: ellipsis;  overflow: hidden; }
.note-json-pre { margin:0; white-space: pre-wrap; word-break: break-word; }
.note-value { white-space: nowrap; };
`;
  const style = document.createElement("style");
  style.id = "note-json-styles";
  style.textContent = css;
  document.head.appendChild(style);
}
formatNotes();
