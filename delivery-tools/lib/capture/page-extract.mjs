// What a page shows, read from the rendered page (spec 4.2 step 3, M4 to M7): the same function
// runs on design renders and on live captures, so the two are comparable line for line.
//
// pageExtract runs inside the browser. Playwright serialises it with toString(), so it must not
// reference anything outside its own body. Design render passes it to page.evaluate directly; the
// capture spec (templates/) loads extractScriptSource() from the job directory.
//
// What it returns:
// - lines: the .txt file. One line per text owner: the nearest non-inline element around a run of
//   visible text, so a sentence with a link in it stays one line, and each cell, label and heading
//   is its own line. Text is as displayed (text-transform applied, whitespace collapsed). Form
//   fields contribute their value, or their placeholder when empty; date and time fields contribute
//   nothing, since their value is wire format the browser redraws. Document order.
// - dom: the .dom.json body (schemas/dom.schema.json). Every visible text owner, every control
//   (semantic, ARIA role, tabindex, or a React click handler, which is how a design's clickable
//   <div>s are found), and every element carrying a data-testid (hidden ones with visible=false).

/**
 * @param {{ root?: string, maxElements?: number, testidAttribute?: string }} [opts]
 * @returns {{ lines: string[], dom: object }}
 */
export function pageExtract(opts) {
  const o = opts || {};
  const MAX = o.maxElements || 6000;
  const TESTID = o.testidAttribute || 'data-testid';
  const doc = document;
  const root = (o.root && doc.querySelector(o.root)) || doc.body;
  const styles = new Map();
  const cs = (el) => { let s = styles.get(el); if (!s) { s = getComputedStyle(el); styles.set(el, s); } return s; };
  const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const visCache = new Map();
  function visible(el) {
    if (visCache.has(el)) return visCache.get(el);
    let v = el.getClientRects().length > 0;
    if (v && typeof el.checkVisibility === 'function') v = el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    else if (v) { const s = cs(el); v = s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0; }
    visCache.set(el, v);
    return v;
  }

  function reactProps(el) {
    for (const k of Object.keys(el)) if (k.startsWith('__reactProps$')) return el[k];
    return null;
  }

  const CONTROL_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'radio',
    'switch', 'option', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem', 'gridcell']);
  function isControl(el) {
    const tag = el.tagName;
    if (tag === 'A') return el.hasAttribute('href') || Boolean(reactProps(el)?.onClick);
    if (tag === 'INPUT') return el.type !== 'hidden';
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') return true;
    const role = el.getAttribute('role');
    if (role && CONTROL_ROLES.has(role)) return true;
    if (el.hasAttribute('onclick')) return true;
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') return true;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) >= 0) return true;
    const p = reactProps(el);
    return Boolean(p && (typeof p.onClick === 'function' || typeof p.onMouseDown === 'function' || typeof p.onPointerDown === 'function'));
  }

  function implicitRole(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.split(/\s+/)[0];
    const tag = el.tagName;
    switch (tag) {
      case 'A': return el.hasAttribute('href') ? 'link' : null;
      case 'BUTTON': case 'SUMMARY': return 'button';
      case 'SELECT': return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
      case 'TEXTAREA': return 'textbox';
      case 'INPUT': {
        const t = (el.type || 'text').toLowerCase();
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'range') return 'slider';
        if (t === 'number') return 'spinbutton';
        if (t === 'search') return 'searchbox';
        if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return 'button';
        return 'textbox';
      }
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': return 'heading';
      case 'IMG': return el.getAttribute('alt') === '' ? 'presentation' : 'img';
      case 'LI': return 'listitem';
      case 'UL': case 'OL': return 'list';
      case 'TABLE': return 'table';
      case 'TR': return 'row';
      case 'TD': return 'cell';
      case 'TH': return 'columnheader';
      case 'NAV': return 'navigation';
      case 'DIALOG': return 'dialog';
      case 'OPTION': return 'option';
      case 'PROGRESS': return 'progressbar';
      case 'LABEL': return null;
      default: return null;
    }
  }

  function fieldText(el) {
    const tag = el.tagName;
    if (tag === 'SELECT') { const opt = el.selectedOptions && el.selectedOptions[0]; return opt ? collapse(opt.textContent) : ''; }
    if (tag === 'TEXTAREA') return collapse(el.value) || collapse(el.placeholder);
    const t = (el.type || 'text').toLowerCase();
    if (['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'image'].includes(t)) return '';
    if (t === 'button' || t === 'submit' || t === 'reset') return collapse(el.value);
    // A date or time field's value is the wire format ("2025-09-30"), not what the browser draws
    // (its own locale-formatted picker), so it is not page copy and the copy lint must not judge it.
    if (['date', 'datetime-local', 'month', 'week', 'time'].includes(t)) return '';
    return collapse(el.value) || collapse(el.placeholder);
  }

  function accName(el) {
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return collapse(al);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => { const x = doc.getElementById(id); return x ? x.innerText || x.textContent : ''; }).join(' ');
      if (collapse(t)) return collapse(t);
    }
    if (el.labels && el.labels.length) {
      const t = Array.from(el.labels).map((l) => l.innerText || l.textContent).join(' ');
      if (collapse(t)) return collapse(t);
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const f = fieldText(el);
      if (f) return f;
    }
    const txt = collapse(el.innerText || '');
    if (txt) return txt.slice(0, 300);
    const title = el.getAttribute('title');
    if (title && title.trim()) return collapse(title);
    const alt = el.getAttribute('alt');
    if (alt && alt.trim()) return collapse(alt);
    const st = el.querySelector && el.querySelector('svg title');
    if (st && collapse(st.textContent)) return collapse(st.textContent);
    return null;
  }

  function transform(text, el) {
    const t = cs(el).textTransform;
    if (t === 'uppercase') return text.toUpperCase();
    if (t === 'lowercase') return text.toLowerCase();
    if (t === 'capitalize') return text.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
    return text;
  }

  // The nearest element around a text run that is not laid out inline: the line's owner.
  const ownerCache = new Map();
  function ownerOf(el) {
    if (ownerCache.has(el)) return ownerCache.get(el);
    let cur = el;
    while (cur && cur !== root) {
      const d = cs(cur).display;
      if (d !== 'inline' && d !== 'contents') break;
      cur = cur.parentElement;
    }
    const owner = cur || root;
    ownerCache.set(el, owner);
    return owner;
  }

  const FIELD = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'DATALIST']);
  const owners = new Map(); // element -> { parts, nodes }
  const addPart = (owner, text, node) => {
    let e = owners.get(owner);
    if (!e) { e = { parts: [], nodes: [] }; owners.set(owner, e); }
    e.parts.push(text);
    if (node) e.nodes.push(node);
  };
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        if (SKIP.has(n.tagName) || n.tagName === 'SELECT' || (n.namespaceURI === 'http://www.w3.org/2000/svg' && (n.tagName === 'title' || n.tagName === 'desc'))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  // A <select>'s subtree is rejected above, so fields are handled when their element is reached.
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 1) {
      if (n.tagName === 'BR' && n.parentElement && visible(n.parentElement)) addPart(ownerOf(n.parentElement), ' ', null);
      if (FIELD.has(n.tagName) && visible(n)) { const f = fieldText(n); if (f) addPart(n, f, null); }
      continue;
    }
    const parent = n.parentElement;
    if (!parent || !visible(parent)) continue;
    const raw = n.data;
    if (!/\S/.test(raw)) { const ow = ownerOf(parent); if (owners.has(ow)) addPart(ow, ' ', null); continue; }
    addPart(ownerOf(parent), transform(raw, parent), n);
  }
  // SELECT was rejected by the walker (its options are not visible text): add the visible ones now.
  for (const sel of root.querySelectorAll('select')) {
    if (visible(sel) && !owners.has(sel)) { const f = fieldText(sel); if (f) addPart(sel, f, null); }
  }

  const ownerText = new Map();
  const lines = [];
  for (const [el, e] of owners) {
    const t = collapse(e.parts.join(''));
    if (!t) continue;
    ownerText.set(el, t);
  }
  // lines in document order of the owners
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) if (ownerText.has(el)) lines.push(ownerText.get(el));

  // Rendered text rows: the rects of the element's visible text runs, merged where they overlap
  // vertically, so an icon or a smaller count on the same row does not count as a second line.
  function lineCount(el) {
    if (FIELD.has(el.tagName)) return ownerText.has(el) ? 1 : 0;
    const e = owners.get(el);
    let nodes = e && e.nodes.length ? e.nodes : null;
    if (!nodes) {
      nodes = [];
      const tw = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n && nodes.length < 400; n = tw.nextNode()) {
        if (/\S/.test(n.data) && n.parentElement && visible(n.parentElement)) nodes.push(n);
      }
    }
    const rects = [];
    for (const node of nodes) {
      const r = doc.createRange();
      r.selectNodeContents(node);
      for (const b of r.getClientRects()) if (b.width > 0 && b.height > 0) rects.push({ top: b.top, bottom: b.bottom });
    }
    rects.sort((a, b) => a.top - b.top);
    let rows = 0, rowBottom = -Infinity;
    for (const b of rects) {
      if (b.top < rowBottom - 2) { rowBottom = Math.max(rowBottom, b.bottom); continue; }
      rows++;
      rowBottom = b.bottom;
    }
    return rows;
  }

  function effectiveBackground(el) {
    for (let cur = el; cur; cur = cur.parentElement) {
      const bg = cs(cur).backgroundColor;
      if (bg && bg !== 'transparent' && !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(bg)) return bg;
    }
    return 'rgba(0, 0, 0, 0)';
  }

  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
    'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'blinkmacsystemfont']);
  const families = (ff) => String(ff || '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  function fontClass(ff) {
    const fams = families(ff).map((f) => f.toLowerCase());
    const first = fams[0] || '';
    if (/mono|code|courier|consol|menlo|monaco/.test(first) || (!first && fams.includes('monospace'))) return 'mono';
    if (/sans|inter|helvetica|arial|roboto|segoe|system-ui|apple-system|blinkmacsystemfont|verdana|tahoma|geist|nunito|lato|montserrat|poppins/.test(first)) return 'sans';
    if (fams.includes('monospace') || fams.includes('ui-monospace')) return 'mono';
    if (fams.includes('sans-serif') || fams.includes('system-ui') || fams.includes('ui-sans-serif') || fams.includes('-apple-system')) return 'sans';
    if (/serif|georgia|times|garamond|cambria|merriweather|playfair/.test(first) || fams.includes('serif') || fams.includes('ui-serif')) return 'serif';
    return 'other';
  }
  function fontLoaded(family) {
    if (GENERIC.has(family.toLowerCase())) return true;
    let faces = 0, loaded = 0;
    doc.fonts.forEach((f) => {
      if (f.family.replace(/^["']|["']$/g, '') === family) { faces++; if (f.status === 'loaded') loaded++; }
    });
    if (loaded) return true;
    if (faces) return false;
    const ctx = doc.createElement('canvas').getContext('2d');
    if (!ctx) return false;
    const probe = 'mmmmmmmmmmlli1WQ@#';
    for (const g of ['monospace', 'serif', 'sans-serif']) {
      ctx.font = `72px ${g}`;
      const w0 = ctx.measureText(probe).width;
      ctx.font = `72px "${family}", ${g}`;
      if (ctx.measureText(probe).width !== w0) return true;
    }
    return false;
  }

  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const weight = (w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : px(w) || 400);

  const picked = [];
  for (const el of all) {
    if (picked.length >= MAX) break;
    const owner = ownerText.has(el);
    const control = isControl(el) && visible(el);
    const testid = el.getAttribute(TESTID);
    if (!owner && !control && !testid) continue;
    picked.push({ el, owner, control, testid });
  }

  const usedFamilies = new Set();
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const elements = picked.map(({ el, owner, control, testid }, i) => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const fam = families(s.fontFamily)[0];
    if (fam && (owner || control)) usedFamilies.add(fam);
    const isVisible = visible(el);
    const inline = s.display === 'inline';
    const clipped = !inline && isVisible && (
      ((el.scrollWidth > el.clientWidth + 1) && (['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis')) ||
      ((el.scrollHeight > el.clientHeight + 1) && ['hidden', 'clip'].includes(s.overflowY)));
    const text = owner ? ownerText.get(el) : collapse(el.innerText || '').slice(0, 1000);
    return {
      i,
      kind: control ? 'control' : 'text',
      tag: el.tagName.toLowerCase(),
      role: implicitRole(el),
      name: control ? accName(el) : (el.getAttribute('aria-label') ? collapse(el.getAttribute('aria-label')) : null),
      text,
      testid: testid || null,
      box: { x: Math.round((r.left + scrollX) * 10) / 10, y: Math.round((r.top + scrollY) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
      visible: isVisible,
      style: {
        fontFamily: s.fontFamily,
        fontClass: fontClass(s.fontFamily),
        fontSize: px(s.fontSize),
        fontWeight: weight(s.fontWeight),
        textTransform: s.textTransform,
        letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
        color: s.color,
        backgroundColor: effectiveBackground(el),
      },
      icon: el.tagName.toLowerCase() === 'svg' || Boolean(el.querySelector && el.querySelector('svg, [data-icon], [class*="icon" i]')),
      clipped: Boolean(clipped),
      lines: isVisible ? lineCount(el) : 0,
      disabled: control ? Boolean(el.disabled === true || el.getAttribute('aria-disabled') === 'true' || s.cursor === 'not-allowed' || (el.closest && el.closest('fieldset:disabled'))) : null,
    };
  });

  const de = doc.documentElement;
  return {
    lines,
    dom: {
      schemaVersion: 1,
      url: location.href,
      viewport: { width: Math.max(1, Math.round(window.innerWidth)), height: Math.max(1, Math.round(window.innerHeight)) },
      document: { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, scrollHeight: de.scrollHeight },
      fonts: Array.from(usedFamilies).sort().map((family) => ({ family, loaded: fontLoaded(family) })),
      elements,
    },
  };
}

/** The extractor as a browser script: defines window.__deliveryExtract(opts). */
export function extractScriptSource() {
  return `// Generated by delivery-tools (lib/capture/page-extract.mjs); do not edit.\nwindow.__deliveryExtract = ${pageExtract.toString()};\n`;
}

/** The .txt body for a list of lines: one per line, ending in a newline (empty page: empty file). */
export function linesToText(lines) {
  return lines.length ? lines.join('\n') + '\n' : '';
}
