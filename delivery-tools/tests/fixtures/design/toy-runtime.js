// A stand-in for a design runtime, for delivery-tools' own browser tests only. It boots an <x-dc>
// page the way design render observes a real one: a library fetched from a CDN URL with an
// integrity hash before boot, data-props defaults as props, this.set() to change state, the page
// under #dc-root .sc-host, click handlers visible as React-style props, and the component reachable
// through a React-style fiber on the host (which is how a {set} step writes state).
(function () {
  var LIB = 'https://cdn.example.invalid/toylib@1.2.3/dist/toylib.js';
  var INTEGRITY = '__TOYLIB_INTEGRITY__';
  var inst = null;
  var host = null;
  var tpl = [];

  function DCLogic(props) { this.props = props; this.state = {}; }
  DCLogic.prototype.setState = function (patch) { Object.assign(this.state, patch); render(); };

  function lookup(scope, expr) {
    var e = String(expr).replace(/[{}]/g, '').trim();
    if (e === 'true') return true;
    if (e === 'false') return false;
    var parts = e.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v === null || v === undefined) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interp(text, scope) {
    return text.replace(/\{\{([^}]*)\}\}/g, function (m, e) {
      var v = lookup(scope, e);
      return v === null || v === undefined || v === false ? '' : String(v);
    });
  }

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.data, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    var kids = Array.prototype.slice.call(node.childNodes);
    if (tag === 'sc-if') {
      if (lookup(scope, node.getAttribute('value'))) kids.forEach(function (c) { build(c, scope, out); });
      return;
    }
    if (tag === 'sc-for') {
      var list = lookup(scope, node.getAttribute('list')) || [];
      var as = node.getAttribute('as') || 'item';
      list.forEach(function (item) {
        var s = Object.create(scope);
        s[as] = item;
        kids.forEach(function (c) { build(c, s, out); });
      });
      return;
    }
    var el = document.createElement(tag);
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      if (a.name.toLowerCase() === 'onclick') {
        var fn = lookup(scope, a.value);
        if (typeof fn === 'function') {
          el.addEventListener('click', fn);
          el['__reactProps$toy'] = { onClick: fn };
        }
        continue;
      }
      el.setAttribute(a.name, interp(a.value, scope));
    }
    kids.forEach(function (c) { build(c, scope, el); });
    out.appendChild(el);
  }

  function render() {
    var vals = Object.assign({}, inst.props, inst.renderVals());
    while (host.firstChild) host.removeChild(host.firstChild);
    tpl.forEach(function (n) { build(n, vals, host); });
  }

  function boot() {
    if (!window.ToyLib || !window.ToyLib.ok) { console.error('toy runtime: library missing'); return; }
    var dc = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    var meta = JSON.parse(script.getAttribute('data-props') || '{}');
    var props = {};
    Object.keys(meta).forEach(function (k) { if (k.charAt(0) !== '$') props[k] = meta[k].default; });
    tpl = Array.prototype.slice.call(dc.childNodes).map(function (n) { return n.cloneNode(true); });
    var Component = new Function('DCLogic', script.textContent + '\n;return Component;')(DCLogic);
    inst = new Component(props);
    var root = document.createElement('div');
    root.id = 'dc-root';
    host = document.createElement('div');
    host.className = 'sc-host';
    host.setAttribute('data-sc-name', 'widgets');
    host['__reactFiber$toy'] = { stateNode: { logic: inst }, return: null };
    root.appendChild(host);
    dc.replaceWith(root);
    render();
  }

  var hide = document.createElement('style');
  hide.textContent = 'x-dc{display:none!important}';
  document.head.appendChild(hide);
  var lib = document.createElement('script');
  lib.src = LIB;
  lib.integrity = INTEGRITY;
  lib.crossOrigin = 'anonymous';
  lib.onload = function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  };
  lib.onerror = function () { console.error('toy runtime: failed to load ' + LIB); };
  document.head.appendChild(lib);
})();
