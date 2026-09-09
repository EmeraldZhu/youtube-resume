'use strict';

/**
 * Minimal DOM tailored to exactly what the reviewed source touches:
 * createElement/createElementNS, appendChild/insertBefore/removeChild/remove,
 * classList, dataset, style, setAttribute/getAttribute, textContent,
 * addEventListener/removeEventListener/dispatchEvent, and a small
 * querySelector/querySelectorAll supporting #id, .class, tag, attribute-less
 * descendant combinators, and comma-separated selector lists — the only
 * forms used by playerObserver/uiInjector/youtubeUtils/popup.
 *
 * Not a general-purpose DOM. Extend deliberately if a later phase's source
 * needs a selector form this doesn't support (it will throw a clear error
 * rather than silently matching nothing).
 */

class ClassList {
  constructor(el) {
    this._el = el;
    this._set = new Set();
  }
  add(c) { this._set.add(c); }
  remove(c) { this._set.delete(c); }
  toggle(c, force) {
    const has = this._set.has(c);
    const want = force === undefined ? !has : force;
    if (want) this._set.add(c); else this._set.delete(c);
    return want;
  }
  contains(c) { return this._set.has(c); }
  get value() { return [...this._set].join(' '); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this._attrs = {};
    this._textContent = '';
    this._listeners = new Map();
    this.classList = new ClassList(this);
    // Media-element-ish fields some tests may poke directly; harmless for
    // plain elements since nothing reads them unless set.
  }

  // v4 Phase 8, 8.7 — popup.js's row-removal focus handoff walks sibling
  // rows via these; only element-vs-element adjacency matters here (this
  // fake tree never mixes in text nodes), so nextElementSibling/
  // previousElementSibling and firstChild/nextSibling coincide.
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.children.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.children.length ? this.parentNode.children[idx + 1] : null;
  }
  get previousElementSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.children.indexOf(this);
    return idx > 0 ? this.parentNode.children[idx - 1] : null;
  }
  get nextSibling() { return this.nextElementSibling; }
  get firstChild() { return this.children.length ? this.children[0] : null; }

  // v4 Phase 8, 8.7 — matches real Chrome: setting .disabled = true on the
  // currently-focused element blurs it synchronously (activeElement reverts
  // to <body>) even though the element is still in the document. This is
  // NOT cosmetic — it's what a live-testing pass on this phase found: code
  // that captures document.activeElement only after disabling a button (to
  // guard against a double-click) always reads <body>, never the button.
  // Modeling it here means that class of bug is caught by this harness too,
  // not only by a real browser.
  get disabled() { return !!this._disabled; }
  set disabled(v) {
    this._disabled = !!v;
    if (this._disabled && this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  get className() { return this.classList.value; }
  set className(v) {
    this.classList = new ClassList(this);
    String(v || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this._textContent = v;
    this.children = [];
  }

  setAttribute(name, value) {
    this._attrs[name] = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
  }
  removeAttribute(name) { delete this._attrs[name]; }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    notifyMutation(this);
    return child;
  }

  insertBefore(newNode, referenceNode) {
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    if (referenceNode == null) return this.appendChild(newNode);
    const idx = this.children.indexOf(referenceNode);
    if (idx === -1) return this.appendChild(newNode);
    this.children.splice(idx, 0, newNode);
    newNode.parentNode = this;
    notifyMutation(this);
    return newNode;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
      notifyMutation(this);
      // Real DOM: removing the focused element (or an ancestor of it) blurs
      // it immediately, resetting activeElement — popup.js's pin-resort
      // refocus (v4 Phase 8, 8.7) depends on this actually happening so the
      // explicit re-focus call after re-insertion is provably necessary,
      // not a no-op in this harness.
      const doc = child.ownerDocument;
      if (doc && doc.activeElement && child.contains(doc.activeElement)) {
        doc.activeElement = doc.body;
      }
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  replaceChildren(...nodes) {
    [...this.children].forEach((c) => this.removeChild(c));
    nodes.forEach((n) => this.appendChild(n));
  }

  /** Self-or-descendant containment check, matching real Node.contains(). */
  contains(node) {
    let n = node;
    while (n) {
      if (n === this) return true;
      n = n.parentNode;
    }
    return false;
  }

  focus() {
    // v4 Phase 8, 8.7 — matches real Chrome: a disabled element cannot
    // receive focus at all. Calling .focus() on one is silently a no-op,
    // not an error and not a fallback to some other element. A live-testing
    // pass on this phase found code that called .focus() on a control
    // before re-enabling it, which did nothing in real Chrome.
    if (this._disabled) return;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }
  dispatchEvent(evt) {
    evt.target = this;
    const set = this._listeners.get(evt.type);
    if (set) [...set].forEach((fn) => fn(evt));
    return true;
  }

  querySelector(sel) { return querySelectorImpl(this, sel, true); }
  querySelectorAll(sel) { return querySelectorImpl(this, sel, false); }

  /** Simple-selector-only closest() (single tag/#id/.class, no combinators) — the only form popup.js uses. */
  closest(sel) {
    let node = this;
    while (node) {
      if (matchesSimple(node, sel)) return node;
      node = node.parentNode;
    }
    return null;
  }
}

function walk(node, visit) {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

/** Parses one simple simple-selector segment: tag, #id, .class (combinable, e.g. "a.foo"). */
function matchesSimple(el, simple) {
  const idMatch = simple.match(/^([a-zA-Z0-9_-]*)((?:[.#][a-zA-Z0-9_-]+)*)$/);
  if (!idMatch) throw new Error(`Unsupported selector fragment: ${simple}`);
  const [, tag, rest] = idMatch;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  const parts = rest.match(/[.#][a-zA-Z0-9_-]+/g) || [];
  for (const p of parts) {
    if (p[0] === '#' && el.id !== p.slice(1)) return false;
    if (p[0] === '.' && !el.classList.contains(p.slice(1))) return false;
  }
  return true;
}

/** Supports descendant combinators ("a b c") and comma-separated lists ("a, b"). */
function matchesSelector(el, ancestors, selector) {
  const parts = selector.trim().split(/\s+/);
  let idx = parts.length - 1;
  if (!matchesSimple(el, parts[idx])) return false;
  idx -= 1;
  let chain = ancestors.slice();
  while (idx >= 0) {
    const found = chain.some((a) => matchesSimple(a, parts[idx]));
    if (!found) return false;
    idx -= 1;
  }
  return true;
}

function querySelectorImpl(root, selector, single) {
  const results = [];
  const selectors = selector.split(',').map((s) => s.trim());
  const ancestorsByNode = new Map();

  function collect(node, ancestors) {
    ancestorsByNode.set(node, ancestors);
    for (const c of node.children) collect(c, [...ancestors, node]);
  }
  collect(root, []);

  for (const [node, ancestors] of ancestorsByNode) {
    if (node === root) continue; // querySelector never matches the root itself
    for (const sel of selectors) {
      if (matchesSelector(node, ancestors, sel)) {
        results.push(node);
        break;
      }
    }
    if (single && results.length) return results[0];
  }
  return single ? (results[0] || null) : results;
}

// --- MutationObserver plumbing -------------------------------------------

const activeObservers = new Set();

function isAncestorOrSelf(target, node) {
  let n = node;
  while (n) {
    if (n === target) return true;
    n = n.parentNode;
  }
  return false;
}

function notifyMutation(node) {
  for (const obs of activeObservers) {
    if (isAncestorOrSelf(obs.target, node)) {
      obs._pending = true;
      if (!obs._scheduled) {
        obs._scheduled = true;
        Promise.resolve().then(() => {
          obs._scheduled = false;
          if (obs._pending && activeObservers.has(obs)) {
            obs._pending = false;
            obs.callback([{ type: 'childList' }], obs);
          }
        });
      }
    }
  }
}

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.target = null;
    this._pending = false;
    this._scheduled = false;
  }
  observe(target) {
    this.target = target;
    activeObservers.add(this);
  }
  disconnect() {
    activeObservers.delete(this);
  }
}

function createDocument() {
  const html = new FakeElement('html');
  const body = new FakeElement('body');
  html.appendChild(body);
  const doc = {
    _root: html,
    body,
    title: '',
    hidden: false,
    // v4 Phase 8, 8.7 — real DOM tracks the focused element here; defaults
    // to <body>, same as a real document with nothing focused yet.
    activeElement: body,
    createElement: (tag) => { const e = new FakeElement(tag); e.ownerDocument = doc; return e; },
    createElementNS: (_ns, tag) => { const e = new FakeElement(tag); e.ownerDocument = doc; return e; },
    querySelector: (sel) => html.querySelector(sel),
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    getElementById: (id) => html.querySelector(`#${id}`),
    _listeners: new Map(),
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = this._listeners.get(type);
      if (set) set.delete(fn);
    },
    dispatchEvent(evt) {
      evt.target = this;
      const set = this._listeners.get(evt.type);
      if (set) [...set].forEach((fn) => fn(evt));
      return true;
    },
  };
  html.ownerDocument = doc;
  body.ownerDocument = doc;
  return doc;
}

function createWindow(document, initialHref) {
  let href = initialHref;
  const listeners = new Map();
  return {
    get location() {
      const url = new URL(href);
      return {
        href,
        pathname: url.pathname,
        search: url.search,
      };
    },
    _setHref(v) { href = v; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = listeners.get(type);
      if (set) set.delete(fn);
    },
    dispatchEvent(evt) {
      evt.target = this;
      const set = listeners.get(evt.type);
      if (set) [...set].forEach((fn) => fn(evt));
      return true;
    },
  };
}

module.exports = {
  FakeElement,
  FakeMutationObserver,
  createDocument,
  createWindow,
};
