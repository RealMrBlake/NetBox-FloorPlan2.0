/*
 * NetBox Floor Planner – interactive SVG floor plan designer.
 * Units: 1 SVG user unit = 1 cm. Item x/y is the top-left corner of the
 * unrotated shape; rotation is applied around the shape's center.
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  const TYPES = {
    area:    { w: 400, h: 300, color: '#22c55e', z: -10, icon: 'mdi-texture-box' },
    wall:    { w: 300, h: 15,  color: '#475569', z: 0,   icon: 'mdi-wall' },
    door:    { w: 90,  h: 10,  color: '#b45309', z: 1,   icon: 'mdi-door' },
    window:  { w: 120, h: 10,  color: '#0ea5e9', z: 1,   icon: 'mdi-window-closed-variant' },
    column:  { w: 40,  h: 40,  color: '#64748b', z: 2,   icon: 'mdi-square' },
    rack:    { w: 60,  h: 120, color: '#3b82f6', z: 5,   icon: 'mdi-server' },
    device:  { w: 50,  h: 50,  color: '#8b5cf6', z: 5,   icon: 'mdi-access-point' },
    cooling: { w: 100, h: 90,  color: '#06b6d4', z: 5,   icon: 'mdi-snowflake' },
    power:   { w: 80,  h: 60,  color: '#f59e0b', z: 5,   icon: 'mdi-flash' },
    label:   { w: 200, h: 40,  color: '#334155', z: 10,  icon: 'mdi-format-text' },
  };
  const SHAPE_ORDER = ['wall', 'door', 'window', 'area', 'column', 'cooling', 'power', 'label'];

  const COLOR_NAMES = {
    green: '#2fb344', red: '#d63939', blue: '#206bc4', cyan: '#17a2b8', yellow: '#f59f00',
    orange: '#f76707', purple: '#ae3ec9', gray: '#868e96', teal: '#0ca678', indigo: '#4263eb',
    pink: '#d6336c', dark: '#343a40', black: '#000000', white: '#ffffff',
  };
  // Fallback status colors for objects coming from the REST API (NetBox defaults)
  const STATUS_COLORS = {
    active: 'green', planned: 'cyan', reserved: 'yellow', available: 'gray', deprecated: 'red',
    offline: 'gray', staged: 'blue', failed: 'red', inventory: 'purple', decommissioning: 'yellow',
  };

  const MIN_SIZE = 5;
  const HISTORY_LIMIT = 100;

  /* ---------- helpers ---------- */

  function svg(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of [].concat(children || [])) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const snap = (v, step) => Math.round(v / step) * step;

  function toCm(value, unit) {
    if (!value) return null;
    const u = unit && (unit.value || unit);
    return Math.round(u === 'in' ? value * 2.54 : value / 10);
  }

  const meterFormat = new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 2 });
  const meters = (cm) => meterFormat.format(cm / 100);
  const roomSize = (w, d) => `${meters(w)} x ${meters(d)}`;

  // "4x3", "4 x 3 m", "12,5 × 8" -> [width_cm, depth_cm]; mirrors utils.parse_room_size()
  function parseRoomSize(value) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*m?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*m?\s*$/i.exec(value || '');
    if (!m) return null;
    return [m[1], m[2]].map((v) => Math.round(parseFloat(v.replace(',', '.')) * 100));
  }

  function download(filename, blob) {
    const a = html('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  /* ---------- designer ---------- */

  class Designer {
    constructor(root, cfg) {
      this.root = root;
      this.cfg = cfg;
      this.edit = cfg.mode === 'edit';
      this.strings = cfg.strings || {};
      this.settings = Object.assign({}, cfg.settings);
      this.items = [];
      this.selection = new Set();
      this.view = { x: 0, y: 0, scale: 1 };
      this.undoStack = [];
      this.redoStack = [];
      this.clipboard = [];
      this.dirty = false;
      this.snapEnabled = true;
      this.gridVisible = true;
      this.colorMode = 'type';
      this.filter = '';
      this.drag = null;
      this.spaceDown = false;
      this.uidCounter = 1;
      this.palette = { racks: null, devices: null, search: '' };
      this.guides = [];

      this.buildDom();
      this.bindEvents();
      this.load();
    }

    t(s, params) {
      let out = this.strings[s] || s;
      for (const [k, v] of Object.entries(params || {})) out = out.replace('{' + k + '}', v);
      return out;
    }

    /* ----- DOM ----- */

    buildDom() {
      this.root.classList.add(this.edit ? 'fp-edit' : 'fp-view');
      this.root.tabIndex = 0;
      this.root.innerHTML = '';

      this.toolbar = html('div', { class: 'fp-toolbar' });
      this.body = html('div', { class: 'fp-body' });
      this.canvasWrap = html('div', { class: 'fp-canvas' });
      this.tooltip = html('div', { class: 'fp-tooltip', hidden: true });
      this.statusBar = html('div', { class: 'fp-statusbar' });

      if (this.edit) {
        this.paletteEl = html('div', { class: 'fp-palette' });
        this.panelEl = html('div', { class: 'fp-panel' });
        this.body.append(this.paletteEl, this.canvasWrap, this.panelEl);
      } else {
        this.body.append(this.canvasWrap);
      }
      this.root.append(this.toolbar, this.body, this.statusBar);

      this.svg = svg('svg', { class: 'fp-svg', xmlns: NS }, this.canvasWrap);
      this.canvasWrap.appendChild(this.tooltip);
      const defs = svg('defs', {}, this.svg);
      this.gridId = 'fp-grid-' + Math.random().toString(36).slice(2, 8);
      this.gridPattern = svg('pattern', { id: this.gridId, patternUnits: 'userSpaceOnUse' }, defs);
      this.gridPath = svg('path', { fill: 'none', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, this.gridPattern);

      this.viewport = svg('g', { class: 'fp-viewport' }, this.svg);
      this.floor = svg('rect', { class: 'fp-floor', x: 0, y: 0 }, this.viewport);
      this.bgImage = svg('image', { preserveAspectRatio: 'none', x: 0, y: 0 }, this.viewport);
      this.gridRect = svg('rect', { x: 0, y: 0, fill: `url(#${this.gridId})`, 'pointer-events': 'none' }, this.viewport);
      this.floorBorder = svg('rect', { class: 'fp-floor-border', x: 0, y: 0, fill: 'none', 'pointer-events': 'none' }, this.viewport);
      this.dimTop = svg('text', { 'text-anchor': 'middle', 'pointer-events': 'none', 'font-family': 'Inter, system-ui, sans-serif' }, this.viewport);
      this.dimLeft = svg('text', { 'text-anchor': 'middle', 'pointer-events': 'none', 'font-family': 'Inter, system-ui, sans-serif' }, this.viewport);
      this.itemsLayer = svg('g', { class: 'fp-items' }, this.viewport);
      this.overlay = svg('g', { class: 'fp-overlay' }, this.viewport);

      this.buildToolbar();
      if (this.edit) this.buildPalette();
      this.updateStatusBar();
    }

    button(icon, title, onclick, extraClass) {
      return html('button', {
        type: 'button', class: 'btn btn-sm fp-btn ' + (extraClass || ''), title: title, 'aria-label': title,
        onclick: (e) => { e.preventDefault(); onclick(e); this.root.focus({ preventScroll: true }); },
      }, [html('i', { class: 'mdi ' + icon })]);
    }

    buildToolbar() {
      const tb = this.toolbar;
      const group = (...nodes) => html('div', { class: 'btn-group fp-group' }, nodes);

      if (this.edit) {
        this.saveBtn = html('button', {
          type: 'button', class: 'btn btn-sm btn-primary fp-save', onclick: () => this.save(),
        }, [html('i', { class: 'mdi mdi-content-save' }), ' ', html('span', { text: this.t('Save') })]);
        this.undoBtn = this.button('mdi-undo', this.t('Undo') + ' (Ctrl+Z)', () => this.undo());
        this.redoBtn = this.button('mdi-redo', this.t('Redo') + ' (Ctrl+Y)', () => this.redo());
        this.snapBtn = this.button('mdi-magnet', this.t('Snap to grid'), () => {
          this.snapEnabled = !this.snapEnabled;
          this.snapBtn.classList.toggle('active', this.snapEnabled);
        }, 'active');
        tb.append(
          group(this.saveBtn),
          group(this.undoBtn, this.redoBtn),
          group(
            this.button('mdi-content-copy', this.t('Duplicate') + ' (Ctrl+D)', () => this.duplicate()),
            this.button('mdi-rotate-right', this.t('Rotate 90°') + ' (R)', () => this.rotateSelection(90)),
            this.button('mdi-arrange-bring-to-front', this.t('Bring to front'), () => this.reorder(1)),
            this.button('mdi-arrange-send-to-back', this.t('Send to back'), () => this.reorder(-1)),
            this.button('mdi-trash-can-outline', this.t('Delete') + ' (Del)', () => this.deleteSelection()),
          ),
        );
      } else {
        this.colorSelect = html('select', {
          class: 'form-select form-select-sm fp-select', title: this.t('Color by'),
          onchange: (e) => { this.colorMode = e.target.value; this.render(); },
        }, [
          html('option', { value: 'type', text: this.t('Color by') + ': ' + this.t('Item type') }),
          html('option', { value: 'status', text: this.t('Color by') + ': ' + this.t('Status') }),
          html('option', { value: 'role', text: this.t('Color by') + ': ' + this.t('Role') }),
        ]);
        this.filterInput = html('input', {
          type: 'search', class: 'form-control form-control-sm fp-search', placeholder: this.t('Highlight…'),
          oninput: (e) => { this.filter = e.target.value.trim().toLowerCase(); this.render(); },
        });
        tb.append(group(this.colorSelect), group(this.filterInput));
      }

      this.zoomLabel = html('span', { class: 'fp-zoom-label', text: '100%' });
      this.gridBtn = this.button('mdi-grid', this.t('Show grid'), () => {
        this.gridVisible = !this.gridVisible;
        this.gridBtn.classList.toggle('active', this.gridVisible);
        this.renderFloor();
      }, 'active');
      tb.append(
        group(
          this.button('mdi-magnify-minus-outline', this.t('Zoom out') + ' (-)', () => this.zoomBy(1 / 1.25)),
          this.zoomLabel,
          this.button('mdi-magnify-plus-outline', this.t('Zoom in') + ' (+)', () => this.zoomBy(1.25)),
          this.button('mdi-fit-to-screen-outline', this.t('Fit to screen') + ' (0)', () => this.fit()),
        ),
        group(...[this.snapBtn, this.gridBtn].filter(Boolean)),
        group(
          this.button('mdi-svg', this.t('Export SVG'), () => this.exportSvg()),
          this.button('mdi-file-image-outline', this.t('Export PNG'), () => this.exportPng()),
          this.button('mdi-fullscreen', this.t('Fullscreen'), () => this.toggleFullscreen()),
        ),
      );
      this.saveState = html('span', { class: 'fp-save-state' });
      tb.append(html('div', { class: 'fp-spacer' }), this.saveState);
    }

    buildPalette() {
      const p = this.paletteEl;
      p.innerHTML = '';
      p.append(html('div', { class: 'fp-palette-title', text: this.t('Shapes') }));
      const shapes = html('div', { class: 'fp-shapes' });
      for (const type of SHAPE_ORDER) {
        shapes.append(this.paletteEntry({ kind: 'shape', type: type }, TYPES[type].icon, this.cfg.types[type] || type));
      }
      p.append(shapes);

      this.paletteSearch = html('input', {
        type: 'search', class: 'form-control form-control-sm fp-palette-search', placeholder: this.t('Search…'),
        oninput: (e) => { this.palette.search = e.target.value.toLowerCase(); this.renderObjectLists(); },
      });
      this.rackList = html('div', { class: 'fp-objlist' }, [html('div', { class: 'fp-muted', text: this.t('Loading…') })]);
      this.deviceList = html('div', { class: 'fp-objlist' }, [html('div', { class: 'fp-muted', text: this.t('Loading…') })]);
      p.append(
        this.paletteSearch,
        html('div', { class: 'fp-palette-title', text: this.t('Racks') }), this.rackList,
        html('div', { class: 'fp-palette-title', text: this.t('Devices') }), this.deviceList,
        html('div', { class: 'fp-hint', text: this.t('Drag onto the plan or click to add') }),
      );
    }

    paletteEntry(payload, icon, label, sub, disabled) {
      const entry = html('div', {
        class: 'fp-entry' + (disabled ? ' disabled' : ''), draggable: disabled ? 'false' : 'true',
        title: disabled ? this.t('Already placed') : this.t('Drag onto the plan or click to add'),
      }, [
        html('i', { class: 'mdi ' + icon }),
        html('span', { class: 'fp-entry-label', text: label }),
        sub ? html('span', { class: 'fp-entry-sub', text: sub }) : null,
        disabled ? html('i', { class: 'mdi mdi-check fp-entry-check' }) : null,
      ]);
      if (!disabled) {
        entry.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/x-floorplanner', JSON.stringify(payload));
          e.dataTransfer.effectAllowed = 'copy';
        });
        entry.addEventListener('click', () => {
          const r = this.svg.getBoundingClientRect();
          this.addFromPayload(payload, this.toWorld(r.left + r.width / 2, r.top + r.height / 2));
        });
      }
      return entry;
    }

    async loadObjects() {
      const fetchAll = async (url) => {
        const out = [];
        let next = url;
        while (next) {
          const resp = await fetch(next, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
          if (!resp.ok) throw new Error(resp.statusText);
          const data = await resp.json();
          out.push(...data.results);
          next = data.next;
        }
        return out;
      };
      try {
        this.palette.racks = await fetchAll(this.cfg.api.racks);
      } catch (e) {
        this.palette.racks = [];
      }
      try {
        this.palette.devices = await fetchAll(this.cfg.api.devices);
      } catch (e) {
        this.palette.devices = [];
      }
      this.renderObjectLists();
    }

    renderObjectLists() {
      if (!this.edit || this.palette.racks === null) return;
      const placed = new Set(this.items.map((i) => i.rack ? 'rack-' + i.rack : i.device ? 'device-' + i.device : null));
      const q = this.palette.search;
      const fill = (container, list, kind, emptyText) => {
        container.innerHTML = '';
        const matches = list.filter((o) => !q || (o.display || o.name || '').toLowerCase().includes(q));
        if (!matches.length) {
          container.append(html('div', { class: 'fp-muted', text: emptyText }));
          return;
        }
        for (const o of matches) {
          const sub = kind === 'rack'
            ? (o.u_height ? o.u_height + 'U' : '')
            : (o.role && (o.role.display || o.role.name)) || '';
          container.append(this.paletteEntry(
            { kind: kind, id: o.id }, TYPES[kind].icon, o.display || o.name, sub, placed.has(kind + '-' + o.id),
          ));
        }
      };
      fill(this.rackList, this.palette.racks, 'rack', this.t('No racks found'));
      fill(this.deviceList, this.palette.devices, 'device', this.t('No devices found'));
    }

    objectInfoFromApi(o) {
      const status = o.status && (o.status.value || o.status);
      return {
        id: o.id,
        name: o.name || o.display,
        url: o.display_url || o.url,
        status: status,
        status_label: o.status && o.status.label,
        status_color: STATUS_COLORS[status] || 'gray',
        role: o.role && (o.role.display || o.role.name),
        role_color: o.role && o.role.color ? '#' + o.role.color : null,
        tenant: o.tenant && (o.tenant.display || o.tenant.name),
        u_height: o.u_height,
      };
    }

    /* ----- data ----- */

    async load() {
      try {
        const resp = await fetch(this.cfg.api.layout, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!resp.ok) throw new Error(resp.statusText);
        this.applyLayout(await resp.json());
      } catch (e) {
        this.setSaveState(this.t('Save failed') + ': ' + e.message, 'error');
      }
      this.renderFloor();
      this.fit();
      this.render();
      this.renderPanel();
      if (this.edit) this.loadObjects();
      if (this.cfg.highlight) this.focusHighlight(this.cfg.highlight);
    }

    applyLayout(data) {
      Object.assign(this.settings, data.settings || {});
      this.items = (data.items || []).map((i) => Object.assign({ uid: this.uidCounter++ }, i));
    }

    serialize() {
      return {
        settings: this.settings,
        items: this.items.map((i) => ({
          item_type: i.item_type, label: i.label || '', x: Math.round(i.x), y: Math.round(i.y),
          width: Math.max(1, Math.round(i.width)), height: Math.max(1, Math.round(i.height)),
          rotation: ((Math.round(i.rotation) % 360) + 360) % 360, color: i.color || '',
          z_index: i.z_index || 0, rack: i.rack || null, device: i.device || null, properties: i.properties || {},
        })),
      };
    }

    async save() {
      if (!this.edit) return;
      this.setSaveState(this.t('Saving…'), 'busy');
      try {
        const resp = await fetch(this.cfg.api.layout, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
          body: JSON.stringify(this.serialize()),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const detail = data.detail || JSON.stringify(data.items || data.settings || data);
          throw new Error(detail);
        }
        const selectedKeys = new Set([...this.selection].map((uid) => this.itemIndex(uid)));
        this.applyLayout(data);
        this.selection = new Set(this.items.filter((_, idx) => selectedKeys.has(idx)).map((i) => i.uid));
        this.dirty = false;
        this.setSaveState(this.t('Saved'), 'ok');
        this.render();
        this.renderPanel();
        this.renderObjectLists();
      } catch (e) {
        this.setSaveState(this.t('Save failed') + ': ' + e.message, 'error');
      }
    }

    setSaveState(text, kind) {
      this.saveState.textContent = text;
      this.saveState.className = 'fp-save-state ' + (kind || '');
    }

    markDirty() {
      this.dirty = true;
      this.setSaveState(this.t('Unsaved changes'), 'dirty');
      this.updateHistoryButtons();
    }

    /* ----- history ----- */

    snapshotState() {
      return JSON.stringify({ settings: this.settings, items: this.items });
    }

    checkpoint() {
      this.undoStack.push(this.snapshotState());
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.markDirty();
    }

    restore(state) {
      const data = JSON.parse(state);
      this.settings = data.settings;
      this.items = data.items;
      const uids = new Set(this.items.map((i) => i.uid));
      this.selection = new Set([...this.selection].filter((u) => uids.has(u)));
      this.renderFloor();
      this.render();
      this.renderPanel();
      this.renderObjectLists();
      this.markDirty();
    }

    undo() {
      if (!this.undoStack.length) return;
      this.redoStack.push(this.snapshotState());
      this.restore(this.undoStack.pop());
    }

    redo() {
      if (!this.redoStack.length) return;
      this.undoStack.push(this.snapshotState());
      this.restore(this.redoStack.pop());
    }

    updateHistoryButtons() {
      if (!this.edit) return;
      this.undoBtn.disabled = !this.undoStack.length;
      this.redoBtn.disabled = !this.redoStack.length;
    }

    /* ----- item operations ----- */

    itemByUid(uid) { return this.items.find((i) => i.uid === uid); }
    itemIndex(uid) { return this.items.findIndex((i) => i.uid === uid); }
    selectedItems() { return this.items.filter((i) => this.selection.has(i.uid)); }

    gridStep(e) {
      return this.snapEnabled && !(e && e.altKey) ? this.settings.grid_size : 1;
    }

    sizeStep(e) {
      return this.snapEnabled && !(e && e.altKey) ? 5 : 1;
    }

    addFromPayload(payload, at) {
      let item;
      if (payload.kind === 'shape') {
        const d = TYPES[payload.type];
        item = { item_type: payload.type, width: d.w, height: d.h, label: payload.type === 'label' ? this.cfg.types.label : '' };
      } else {
        const list = payload.kind === 'rack' ? this.palette.racks : this.palette.devices;
        const obj = (list || []).find((o) => o.id === payload.id);
        if (!obj) return;
        if (this.items.some((i) => i[payload.kind] === obj.id)) return;
        const w = payload.kind === 'rack' ? (toCm(obj.outer_width, obj.outer_unit) || this.cfg.defaults.rack_width) : TYPES.device.w;
        const h = payload.kind === 'rack' ? (toCm(obj.outer_depth, obj.outer_unit) || this.cfg.defaults.rack_depth) : TYPES.device.h;
        item = { item_type: payload.kind, width: w, height: h, label: '', object: this.objectInfoFromApi(obj) };
        item[payload.kind] = obj.id;
      }
      const step = this.gridStep();
      Object.assign(item, {
        uid: this.uidCounter++,
        x: snap(at.x - item.width / 2, step),
        y: snap(at.y - item.height / 2, step),
        rotation: 0, color: '', z_index: TYPES[item.item_type].z, properties: {},
        rack: item.rack || null, device: item.device || null,
      });
      this.checkpoint();
      this.items.push(item);
      this.selection = new Set([item.uid]);
      this.render();
      this.renderPanel();
      this.renderObjectLists();
    }

    deleteSelection() {
      if (!this.selection.size) return;
      this.checkpoint();
      this.items = this.items.filter((i) => !this.selection.has(i.uid));
      this.selection.clear();
      this.render();
      this.renderPanel();
      this.renderObjectLists();
    }

    copySelection() {
      this.clipboard = JSON.parse(JSON.stringify(this.selectedItems()));
    }

    paste(offset) {
      // Linked racks/devices may exist only once on a plan, so pasted copies are unlinked
      if (!this.clipboard.length) return;
      this.checkpoint();
      const step = offset === undefined ? this.settings.grid_size : offset;
      const added = this.clipboard.map((src) => {
        const copy = JSON.parse(JSON.stringify(src));
        Object.assign(copy, { uid: this.uidCounter++, x: src.x + step, y: src.y + step, id: undefined });
        if (copy.rack || copy.device) {
          copy.label = copy.label || (copy.object && copy.object.name) || '';
          copy.item_type = copy.rack ? 'rack' : 'device';
          copy.rack = null; copy.device = null; copy.object = null;
        }
        return copy;
      });
      this.items.push(...added);
      this.clipboard = JSON.parse(JSON.stringify(added));
      this.selection = new Set(added.map((i) => i.uid));
      this.render();
      this.renderPanel();
    }

    duplicate() {
      this.copySelection();
      this.paste();
    }

    rotateSelection(deg) {
      const items = this.selectedItems();
      if (!items.length) return;
      this.checkpoint();
      for (const i of items) i.rotation = (((i.rotation || 0) + deg) % 360 + 360) % 360;
      this.render();
      this.renderPanel();
    }

    reorder(direction) {
      const items = this.selectedItems();
      if (!items.length) return;
      this.checkpoint();
      const zs = this.items.map((i) => i.z_index || 0);
      const target = direction > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      for (const i of items) i.z_index = clamp(target, -32000, 32000);
      this.render();
      this.renderPanel();
    }

    nudge(dx, dy) {
      const items = this.selectedItems();
      if (!items.length) return;
      this.checkpoint();
      for (const i of items) { i.x += dx; i.y += dy; }
      this.render();
      this.renderPanel();
    }

    /* ----- geometry ----- */

    toWorld(clientX, clientY) {
      const r = this.svg.getBoundingClientRect();
      return {
        x: (clientX - r.left - this.view.x) / this.view.scale,
        y: (clientY - r.top - this.view.y) / this.view.scale,
      };
    }

    bbox(i) {
      const a = (i.rotation || 0) * Math.PI / 180;
      const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const w = i.width * c + i.height * s, h = i.width * s + i.height * c;
      const cx = i.x + i.width / 2, cy = i.y + i.height / 2;
      return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
    }

    applyView() {
      this.viewport.setAttribute('transform', `translate(${this.view.x} ${this.view.y}) scale(${this.view.scale})`);
      this.zoomLabel.textContent = Math.round(this.view.scale * 100 / this.baseScale()) + '%';
      this.renderOverlay();
    }

    baseScale() {
      const r = this.svg.getBoundingClientRect();
      // Leave room for the dimension labels on the top and left edge
      const pad = this.dimFontSize() * 2;
      const m = 40;
      return Math.max(0.01, Math.min(
        (r.width - m) / (this.settings.width + pad), (r.height - m) / (this.settings.depth + pad),
      ));
    }

    fit() {
      const r = this.svg.getBoundingClientRect();
      const s = this.baseScale();
      const pad = this.dimFontSize();
      this.view = {
        scale: s,
        x: (r.width - (this.settings.width - pad) * s) / 2,
        y: (r.height - (this.settings.depth - pad) * s) / 2,
      };
      this.applyView();
    }

    zoomBy(factor, clientX, clientY) {
      const r = this.svg.getBoundingClientRect();
      const cx = clientX === undefined ? r.left + r.width / 2 : clientX;
      const cy = clientY === undefined ? r.top + r.height / 2 : clientY;
      const before = this.toWorld(cx, cy);
      const base = this.baseScale();
      this.view.scale = clamp(this.view.scale * factor, base * 0.1, base * 40);
      this.view.x = cx - r.left - before.x * this.view.scale;
      this.view.y = cy - r.top - before.y * this.view.scale;
      this.applyView();
    }

    /* ----- rendering ----- */

    cssVar(name, fallback) {
      return getComputedStyle(this.root).getPropertyValue(name).trim() || fallback;
    }

    renderFloor() {
      const { width, depth, grid_size: g } = this.settings;
      for (const r of [this.floor, this.gridRect, this.floorBorder]) {
        r.setAttribute('width', width);
        r.setAttribute('height', depth);
      }
      this.floor.setAttribute('fill', this.cssVar('--fp-floor', '#ffffff'));
      this.floorBorder.setAttribute('stroke', this.cssVar('--fp-wall', '#334155'));
      this.floorBorder.setAttribute('stroke-width', 4);
      this.gridPattern.setAttribute('width', g);
      this.gridPattern.setAttribute('height', g);
      this.gridPath.setAttribute('d', `M ${g} 0 L 0 0 0 ${g}`);
      this.gridPath.setAttribute('stroke', this.cssVar('--fp-grid', '#e2e8f0'));
      this.gridRect.style.display = this.gridVisible ? '' : 'none';

      // Room dimensions in meters along the top and left edge
      const fs = this.dimFontSize();
      const muted = this.cssVar('--fp-muted', '#6c757d');
      this.dimTop.setAttribute('x', width / 2);
      this.dimTop.setAttribute('y', -fs * 0.6);
      this.dimTop.setAttribute('font-size', fs);
      this.dimTop.setAttribute('fill', muted);
      this.dimTop.textContent = meters(width) + ' m';
      this.dimLeft.setAttribute('x', 0);
      this.dimLeft.setAttribute('y', 0);
      this.dimLeft.setAttribute('font-size', fs);
      this.dimLeft.setAttribute('fill', muted);
      this.dimLeft.setAttribute('transform', `translate(${-fs * 0.6} ${depth / 2}) rotate(-90)`);
      this.dimLeft.textContent = meters(depth) + ' m';

      const bg = this.cfg.background || {};
      if (bg.url) {
        this.bgImage.setAttribute('href', bg.url);
        this.bgImage.setAttribute('width', width);
        this.bgImage.setAttribute('height', depth);
        this.bgImage.setAttribute('opacity', bg.opacity);
      } else {
        this.bgImage.style.display = 'none';
      }
    }

    dimFontSize() {
      return clamp(Math.max(this.settings.width, this.settings.depth) * 0.025, 10, 200);
    }

    itemColor(i) {
      if (!this.edit && this.colorMode !== 'type' && i.object) {
        if (this.colorMode === 'status') return COLOR_NAMES[i.object.status_color] || i.object.status_color || '#868e96';
        if (this.colorMode === 'role' && i.object.role_color) return i.object.role_color;
        return '#868e96';
      }
      return i.color || TYPES[i.item_type].color;
    }

    itemText(i) {
      return i.label || (i.object && i.object.name) || '';
    }

    matchesFilter(i) {
      if (!this.filter) return true;
      const o = i.object || {};
      return [this.itemText(i), o.role, o.tenant, o.status_label].some((v) => v && v.toLowerCase().includes(this.filter));
    }

    render() {
      const layer = this.itemsLayer;
      layer.innerHTML = '';
      const textColor = this.cssVar('--fp-text', '#0f172a');
      const sorted = this.items.map((i, idx) => [i, idx]).sort((a, b) => (a[0].z_index || 0) - (b[0].z_index || 0) || a[1] - b[1]);
      for (const [i] of sorted) layer.appendChild(this.renderItem(i, textColor));
      this.renderOverlay();
      this.updateStatusBar();
      this.updateHistoryButtons();
    }

    renderItem(i, textColor) {
      const { x, y, width: w, height: h } = i;
      const cx = x + w / 2, cy = y + h / 2;
      const color = this.itemColor(i);
      const linked = !!(i.rack || i.device);
      const g = svg('g', {
        class: 'fp-item fp-type-' + i.item_type + (linked ? ' fp-linked' : '') + (this.matchesFilter(i) ? '' : ' fp-dimmed'),
        'data-uid': i.uid,
        transform: i.rotation ? `rotate(${i.rotation} ${cx} ${cy})` : null,
      });
      const base = { x: x, y: y, width: w, height: h, 'vector-effect': 'non-scaling-stroke' };

      switch (i.item_type) {
        case 'area':
          svg('rect', Object.assign(base, { fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '8 4', rx: 4 }), g);
          break;
        case 'wall':
          svg('rect', Object.assign(base, { fill: color, stroke: color, 'stroke-width': 1 }), g);
          break;
        case 'door': {
          svg('rect', Object.assign(base, { fill: color, stroke: color, 'stroke-width': 1 }), g);
          const r = w;
          svg('path', {
            d: `M ${x + w} ${y} A ${r} ${r} 0 0 0 ${x} ${y - r} L ${x} ${y}`,
            fill: color, 'fill-opacity': 0.08, stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 3',
            'vector-effect': 'non-scaling-stroke',
          }, g);
          break;
        }
        case 'window':
          svg('rect', Object.assign(base, { fill: this.cssVar('--fp-floor', '#fff'), stroke: color, 'stroke-width': 2 }), g);
          svg('line', { x1: x, y1: cy, x2: x + w, y2: cy, stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g);
          break;
        case 'column':
          svg('rect', Object.assign(base, { fill: color, 'fill-opacity': 0.35, stroke: color, 'stroke-width': 2 }), g);
          svg('path', { d: `M ${x} ${y} L ${x + w} ${y + h} M ${x + w} ${y} L ${x} ${y + h}`, stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g);
          break;
        case 'label':
          svg('rect', Object.assign(base, { fill: 'transparent', stroke: this.edit ? color : 'none', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.4 }), g);
          break;
        default: {
          // rack, device, cooling, power
          svg('rect', Object.assign(base, { fill: color, 'fill-opacity': 0.85, stroke: this.shade(color), 'stroke-width': 2, rx: 2 }), g);
          if (i.item_type === 'rack') {
            // Front indicator: thick bar on the front (bottom) side
            const fh = Math.min(h * 0.12, 10);
            svg('rect', { x: x, y: y + h - fh, width: w, height: fh, fill: this.shade(color), 'pointer-events': 'none' }, g);
          }
          if (i.item_type === 'cooling' || i.item_type === 'power') {
            const sym = i.item_type === 'cooling' ? '❄' : '⚡';
            const fs = Math.min(w, h) * 0.45;
            svg('text', { x: cx, y: y + fs * 0.9, 'font-size': fs, 'text-anchor': 'middle', fill: '#ffffff', 'pointer-events': 'none' }, g).textContent = sym;
          }
        }
      }

      const text = this.itemText(i);
      if (text) {
        const onShape = ['rack', 'device', 'cooling', 'power'].includes(i.item_type);
        const fs = i.item_type === 'label'
          ? Math.max(8, h * 0.6)
          : clamp(Math.min(h * 0.3, (w * 1.6) / Math.max(text.length, 3)), 6, 60);
        const ty = i.item_type === 'area' ? y + fs * 1.2 : (i.item_type === 'cooling' || i.item_type === 'power') ? y + h - fs * 0.6 : cy;
        const tx = i.item_type === 'area' ? x + fs * 0.5 : cx;
        const tnode = svg('text', {
          x: tx, y: ty, 'font-size': fs, 'font-family': 'Inter, system-ui, sans-serif', 'font-weight': 600,
          'text-anchor': i.item_type === 'area' ? 'start' : 'middle', 'dominant-baseline': 'middle',
          fill: onShape ? '#ffffff' : (i.item_type === 'label' ? (i.color || textColor) : this.shade(color)),
          'pointer-events': 'none',
        }, g);
        tnode.textContent = text;
      }
      return g;
    }

    shade(hex) {
      // Darken a hex color by ~30 % for borders
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return hex;
      const n = parseInt(m[1], 16);
      const f = (v) => Math.round(v * 0.7).toString(16).padStart(2, '0');
      return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
    }

    renderOverlay() {
      const o = this.overlay;
      o.innerHTML = '';
      const px = 1 / this.view.scale;
      for (const gl of this.guides) {
        svg('line', Object.assign({ class: 'fp-guide', 'stroke-width': px }, gl), o);
      }
      const items = this.selectedItems();
      for (const i of items) {
        const cx = i.x + i.width / 2, cy = i.y + i.height / 2;
        const g = svg('g', { transform: i.rotation ? `rotate(${i.rotation} ${cx} ${cy})` : null }, o);
        svg('rect', {
          class: 'fp-selection', x: i.x - 2 * px, y: i.y - 2 * px, width: i.width + 4 * px, height: i.height + 4 * px,
          'stroke-width': 1.5 * px, 'stroke-dasharray': `${4 * px} ${3 * px}`,
        }, g);
        if (this.edit && items.length === 1) {
          const hs = 9 * px;
          svg('line', { class: 'fp-rot-line', x1: cx, y1: i.y, x2: cx, y2: i.y - 24 * px, 'stroke-width': px }, g);
          svg('circle', { class: 'fp-handle fp-rot', 'data-handle': 'rot', cx: cx, cy: i.y - 24 * px, r: hs * 0.6, 'stroke-width': px }, g);
          for (const hx of [-1, 0, 1]) {
            for (const hy of [-1, 0, 1]) {
              if (!hx && !hy) continue;
              svg('rect', {
                class: 'fp-handle', 'data-handle': `${hx},${hy}`,
                x: cx + hx * i.width / 2 - hs / 2, y: cy + hy * i.height / 2 - hs / 2, width: hs, height: hs,
                'stroke-width': px, style: `cursor:${this.resizeCursor(hx, hy, i.rotation)}`,
              }, g);
            }
          }
        }
      }
      if (this.drag && this.drag.kind === 'band') {
        const b = this.drag;
        svg('rect', {
          class: 'fp-band', x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1),
          width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0), 'stroke-width': px,
        }, o);
      }
      if (this.highlightUid) {
        const i = this.itemByUid(this.highlightUid);
        if (i) {
          const b = this.bbox(i);
          svg('rect', {
            class: 'fp-highlight', x: b.x1 - 10 * px, y: b.y1 - 10 * px, width: b.x2 - b.x1 + 20 * px, height: b.y2 - b.y1 + 20 * px,
            rx: 6 * px, 'stroke-width': 3 * px,
          }, o);
        }
      }
    }

    resizeCursor(hx, hy, rot) {
      const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
      const angle = Math.atan2(hy, hx) * 180 / Math.PI + (rot || 0);
      return cursors[((Math.round(angle / 45) % 4) + 4) % 4];
    }

    updateStatusBar() {
      const help = this.edit
        ? this.t('Drag: move · Alt: no snapping · Shift+click: multi-select · Space+drag / middle mouse: pan · Wheel: zoom · R: rotate · Del: delete · Ctrl+Z/Y: undo/redo · Ctrl+C/V/D: copy/paste/duplicate · Ctrl+S: save')
        : this.t('Wheel: zoom · Drag: pan · Click a rack or device to open it');
      this.statusBar.textContent = (!this.edit && !this.items.length ? this.t('This floor plan is empty.') + ' · ' : '') + help;
    }

    /* ----- properties panel ----- */

    renderPanel() {
      if (!this.edit) return;
      const p = this.panelEl;
      p.innerHTML = '';
      const items = this.selectedItems();
      p.append(html('div', { class: 'fp-palette-title', text: this.t('Properties') }));

      const field = (label, input) => html('label', { class: 'fp-field' }, [html('span', { text: label }), input]);
      const num = (value, onchange, opts) => html('input', Object.assign({
        type: 'number', class: 'form-control form-control-sm', value: Math.round(value),
        onchange: (e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) onchange(v); },
      }, opts || {}));

      if (!items.length) {
        p.append(html('div', { class: 'fp-muted', text: this.t('Nothing selected – plan settings') }));
        const setSetting = (key, min) => (v) => {
          this.checkpoint();
          this.settings[key] = Math.max(min, v);
          this.renderFloor();
          this.render();
          this.renderPanel();
        };
        const sizeInput = html('input', {
          type: 'text', class: 'form-control form-control-sm', value: roomSize(this.settings.width, this.settings.depth),
          placeholder: this.t('e.g. 4 x 3'), title: this.t('Width x depth in meters, e.g. 4 x 3'),
          onchange: (e) => {
            const size = parseRoomSize(e.target.value);
            if (!size || size[0] < 100 || size[1] < 100) { e.target.classList.add('is-invalid'); return; }
            this.checkpoint();
            [this.settings.width, this.settings.depth] = size;
            this.renderFloor();
            this.render();
            this.renderPanel();
            this.fit();
          },
        });
        p.append(
          field(this.t('Room size (m)'), sizeInput),
          html('div', { class: 'fp-muted fp-field', text: this.t('Floor area') + ': ' + meters(this.settings.width * this.settings.depth / 100) + ' m²' }),
          field(this.t('Width (cm)'), num(this.settings.width, setSetting('width', 100), { min: 100, step: 10 })),
          field(this.t('Depth (cm)'), num(this.settings.depth, setSetting('depth', 100), { min: 100, step: 10 })),
          field(this.t('Grid size (cm)'), num(this.settings.grid_size, setSetting('grid_size', 5), { min: 5, step: 5 })),
        );
        return;
      }

      const update = (fn) => { this.checkpoint(); items.forEach(fn); this.render(); this.renderPanel(); };

      if (items.length > 1) {
        p.append(html('div', { class: 'fp-muted', text: this.t('{n} items selected', { n: items.length }) }));
        p.append(field(this.t('Color'), html('input', {
          type: 'color', class: 'form-control form-control-sm form-control-color', value: items[0].color || TYPES[items[0].item_type].color,
          onchange: (e) => update((i) => { i.color = e.target.value; }),
        })));
        p.append(field(this.t('Rotation (°)'), num(items[0].rotation || 0, (v) => update((i) => { i.rotation = ((v % 360) + 360) % 360; }), { step: 15 })));
        return;
      }

      const i = items[0];
      const typeLabel = this.cfg.types[i.item_type] || i.item_type;
      p.append(html('div', { class: 'fp-type-badge' }, [html('i', { class: 'mdi ' + TYPES[i.item_type].icon }), ' ' + typeLabel]));

      if (i.object) {
        const o = i.object;
        const rows = [
          [this.t('Linked object'), html('a', { href: o.url, target: '_blank', text: o.name })],
          o.status_label ? [this.t('Status'), html('span', { class: 'badge text-bg-' + (o.status_color || 'secondary'), text: o.status_label })] : null,
          o.role ? [this.t('Role'), o.role] : null,
          o.tenant ? [this.t('Tenant'), o.tenant] : null,
          o.u_height ? [this.t('Height (U)'), String(o.u_height)] : null,
        ].filter(Boolean);
        p.append(html('dl', { class: 'fp-info' }, rows.flatMap(([k, v]) => [html('dt', { text: k }), html('dd', {}, [v])])));
      }

      p.append(
        field(this.t('Label'), html('input', {
          type: 'text', class: 'form-control form-control-sm', value: i.label || '', maxlength: 100,
          placeholder: (i.object && i.object.name) || '',
          onchange: (e) => update((it) => { it.label = e.target.value; }),
        })),
        html('div', { class: 'fp-row' }, [
          field(this.t('X (cm)'), num(i.x, (v) => update((it) => { it.x = v; }))),
          field(this.t('Y (cm)'), num(i.y, (v) => update((it) => { it.y = v; }))),
        ]),
        html('div', { class: 'fp-row' }, [
          field(this.t('Width (cm)'), num(i.width, (v) => update((it) => { it.width = Math.max(1, v); }), { min: 1 })),
          field(this.t('Depth (cm)'), num(i.height, (v) => update((it) => { it.height = Math.max(1, v); }), { min: 1 })),
        ]),
        html('div', { class: 'fp-muted fp-field', text: '= ' + roomSize(i.width, i.height) + ' m' }),
        field(this.t('Rotation (°)'), num(i.rotation || 0, (v) => update((it) => { it.rotation = ((v % 360) + 360) % 360; }), { step: 15 })),
        field(this.t('Color'), html('div', { class: 'fp-color' }, [
          html('input', {
            type: 'color', class: 'form-control form-control-sm form-control-color', value: i.color || TYPES[i.item_type].color,
            onchange: (e) => update((it) => { it.color = e.target.value; }),
          }),
          html('button', {
            type: 'button', class: 'btn btn-sm btn-outline-secondary', title: this.t('Reset color'),
            onclick: () => update((it) => { it.color = ''; }),
          }, [html('i', { class: 'mdi mdi-restore' })]),
        ])),
      );
    }

    /* ----- events ----- */

    bindEvents() {
      const s = this.svg;
      s.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      s.addEventListener('pointermove', (e) => this.onPointerMove(e));
      s.addEventListener('pointerup', (e) => this.onPointerUp(e));
      s.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      s.addEventListener('pointerleave', () => { this.tooltip.hidden = true; });
      s.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || !e.shiftKey) {
          this.zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX, e.clientY);
        } else {
          this.view.x -= e.deltaY;
          this.applyView();
        }
      }, { passive: false });
      s.addEventListener('dblclick', (e) => {
        const g = e.target.closest('.fp-item');
        if (!g || !this.edit) return;
        const i = this.itemByUid(+g.dataset.uid);
        const input = this.panelEl.querySelector('input[type=text]');
        if (i && input) { input.focus(); input.select(); }
      });

      if (this.edit) {
        s.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        s.addEventListener('drop', (e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData('application/x-floorplanner');
          if (!raw) return;
          this.addFromPayload(JSON.parse(raw), this.toWorld(e.clientX, e.clientY));
          this.root.focus({ preventScroll: true });
        });
        window.addEventListener('beforeunload', (e) => {
          if (this.dirty) { e.preventDefault(); e.returnValue = this.t('You have unsaved changes. Leave anyway?'); }
        });
      }

      this.root.addEventListener('keydown', (e) => this.onKeyDown(e));
      this.root.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; this.svg.classList.remove('fp-panning'); } });
      new ResizeObserver(() => this.applyView()).observe(this.canvasWrap);
      // Re-color the floor when NetBox switches between light and dark mode
      new MutationObserver(() => { this.renderFloor(); this.render(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    }

    onKeyDown(e) {
      if (e.target.closest('input, textarea, select')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space') { this.spaceDown = true; this.svg.classList.add('fp-panning'); e.preventDefault(); return; }
      if (key === '+' || key === '=') { this.zoomBy(1.25); e.preventDefault(); return; }
      if (key === '-') { this.zoomBy(1 / 1.25); e.preventDefault(); return; }
      if (key === '0') { this.fit(); e.preventDefault(); return; }
      if (key === 'escape') { this.selection.clear(); this.render(); this.renderPanel(); return; }
      if (!this.edit) return;

      if (ctrl && key === 's') { e.preventDefault(); this.save(); return; }
      if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
      if (ctrl && key === 'c') { e.preventDefault(); this.copySelection(); return; }
      if (ctrl && key === 'v') { e.preventDefault(); this.paste(); return; }
      if (ctrl && key === 'd') { e.preventDefault(); this.duplicate(); return; }
      if (ctrl && key === 'a') {
        e.preventDefault();
        this.selection = new Set(this.items.map((i) => i.uid));
        this.render(); this.renderPanel();
        return;
      }
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); this.deleteSelection(); return; }
      if (key === 'r' && !ctrl) { e.preventDefault(); this.rotateSelection(e.shiftKey ? -90 : 90); return; }
      const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if (arrows[key] && this.selection.size) {
        e.preventDefault();
        const step = e.shiftKey ? this.settings.grid_size : 1;
        this.nudge(arrows[key][0] * step, arrows[key][1] * step);
      }
    }

    onPointerDown(e) {
      this.root.focus({ preventScroll: true });
      const w = this.toWorld(e.clientX, e.clientY);
      const handle = e.target.closest('[data-handle]');
      const itemEl = e.target.closest('.fp-item');
      const item = itemEl ? this.itemByUid(+itemEl.dataset.uid) : null;
      this.highlightUid = null;

      if (e.button === 1 || this.spaceDown || (!this.edit && e.button === 0)) {
        this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false, item: item };
      } else if (e.button !== 0) {
        return;
      } else if (handle && this.edit) {
        const i = this.selectedItems()[0];
        this.drag = {
          kind: handle.dataset.handle === 'rot' ? 'rotate' : 'resize',
          dirs: handle.dataset.handle.split(',').map(Number),
          start: { x: i.x, y: i.y, w: i.width, h: i.height, r: i.rotation || 0 },
          item: i, changed: false,
        };
      } else if (item) {
        if (e.shiftKey) {
          if (this.selection.has(item.uid)) this.selection.delete(item.uid); else this.selection.add(item.uid);
        } else if (!this.selection.has(item.uid)) {
          this.selection = new Set([item.uid]);
        }
        const origins = new Map(this.selectedItems().map((i) => [i.uid, { x: i.x, y: i.y }]));
        this.drag = { kind: 'move', w0: w, origins: origins, primary: item, changed: false };
        this.render();
        this.renderPanel();
      } else {
        if (!e.shiftKey) this.selection.clear();
        this.drag = { kind: 'band', x0: w.x, y0: w.y, x1: w.x, y1: w.y, additive: new Set(this.selection) };
        this.render();
        this.renderPanel();
      }
      this.svg.setPointerCapture(e.pointerId);
    }

    onPointerMove(e) {
      const d = this.drag;
      if (!d) {
        this.updateTooltip(e);
        return;
      }
      const w = this.toWorld(e.clientX, e.clientY);

      if (d.kind === 'pan') {
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        this.view.x = d.vx + dx;
        this.view.y = d.vy + dy;
        this.applyView();
        return;
      }

      if (d.kind === 'band') {
        d.x1 = w.x; d.y1 = w.y;
        const x1 = Math.min(d.x0, d.x1), x2 = Math.max(d.x0, d.x1), y1 = Math.min(d.y0, d.y1), y2 = Math.max(d.y0, d.y1);
        this.selection = new Set(d.additive);
        for (const i of this.items) {
          const b = this.bbox(i);
          if (b.x1 < x2 && b.x2 > x1 && b.y1 < y2 && b.y2 > y1) this.selection.add(i.uid);
        }
        this.renderOverlay();
        return;
      }

      if (!d.changed) { this.checkpoint(); d.changed = true; }

      if (d.kind === 'move') {
        let dx = w.x - d.w0.x, dy = w.y - d.w0.y;
        const p0 = d.origins.get(d.primary.uid);
        const step = this.gridStep(e);
        dx = snap(p0.x + dx, step) - p0.x;
        dy = snap(p0.y + dy, step) - p0.y;
        // Magnetic snapping against the edges of other items
        this.guides = [];
        if (this.snapEnabled && !e.altKey) {
          const adj = this.magnet(dx, dy, d.origins);
          dx = adj.dx; dy = adj.dy;
        }
        for (const i of this.selectedItems()) {
          const o = d.origins.get(i.uid);
          i.x = o.x + dx; i.y = o.y + dy;
        }
        this.render();
        return;
      }

      const i = d.item, s = d.start;
      if (d.kind === 'rotate') {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        let angle = Math.atan2(w.y - cy, w.x - cx) * 180 / Math.PI + 90;
        angle = snap(angle, this.snapEnabled && !e.altKey ? 15 : 1);
        i.rotation = ((Math.round(angle) % 360) + 360) % 360;
        this.render();
        return;
      }

      if (d.kind === 'resize') {
        const [hx, hy] = d.dirs;
        const a = s.r * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
        const cx0 = s.x + s.w / 2, cy0 = s.y + s.h / 2;
        const px = w.x - cx0, py = w.y - cy0;
        const lx = px * cos + py * sin, ly = -px * sin + py * cos;
        const step = this.sizeStep(e);
        let left = -s.w / 2, right = s.w / 2, top = -s.h / 2, bottom = s.h / 2;
        if (hx === 1) right = left + Math.max(MIN_SIZE, snap(lx - left, step));
        if (hx === -1) left = right - Math.max(MIN_SIZE, snap(right - lx, step));
        if (hy === 1) bottom = top + Math.max(MIN_SIZE, snap(ly - top, step));
        if (hy === -1) top = bottom - Math.max(MIN_SIZE, snap(bottom - ly, step));
        const nw = right - left, nh = bottom - top;
        const lcx = (left + right) / 2, lcy = (top + bottom) / 2;
        const wcx = cx0 + lcx * cos - lcy * sin, wcy = cy0 + lcx * sin + lcy * cos;
        i.width = Math.round(nw); i.height = Math.round(nh);
        i.x = Math.round(wcx - nw / 2); i.y = Math.round(wcy - nh / 2);
        this.render();
      }
    }

    magnet(dx, dy, origins) {
      const threshold = 8 / this.view.scale;
      const moving = this.selectedItems().map((i) => {
        const o = origins.get(i.uid);
        return this.bbox(Object.assign({}, i, { x: o.x + dx, y: o.y + dy }));
      });
      const mb = {
        x1: Math.min(...moving.map((b) => b.x1)), x2: Math.max(...moving.map((b) => b.x2)),
        y1: Math.min(...moving.map((b) => b.y1)), y2: Math.max(...moving.map((b) => b.y2)),
      };
      const others = this.items.filter((i) => !this.selection.has(i.uid) && i.item_type !== 'area').map((i) => this.bbox(i));
      others.push({ x1: 0, y1: 0, x2: this.settings.width, y2: this.settings.depth });
      let bestX = null, bestY = null;
      for (const b of others) {
        for (const [m, t] of [[mb.x1, b.x1], [mb.x1, b.x2], [mb.x2, b.x1], [mb.x2, b.x2]]) {
          const diff = t - m;
          if (Math.abs(diff) < threshold && (bestX === null || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff: diff, at: t };
        }
        for (const [m, t] of [[mb.y1, b.y1], [mb.y1, b.y2], [mb.y2, b.y1], [mb.y2, b.y2]]) {
          const diff = t - m;
          if (Math.abs(diff) < threshold && (bestY === null || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff: diff, at: t };
        }
      }
      if (bestX) {
        dx += bestX.diff;
        this.guides.push({ x1: bestX.at, x2: bestX.at, y1: -100000, y2: 100000 });
      }
      if (bestY) {
        dy += bestY.diff;
        this.guides.push({ y1: bestY.at, y2: bestY.at, x1: -100000, x2: 100000 });
      }
      return { dx: Math.round(dx), dy: Math.round(dy) };
    }

    onPointerUp(e) {
      const d = this.drag;
      this.drag = null;
      this.guides = [];
      if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
      if (!d) return;
      if (d.kind === 'pan' && !d.moved && !this.edit) {
        // Click in view mode: open the linked object
        if (d.item && d.item.object && d.item.object.url) {
          if (e.ctrlKey || e.metaKey || e.button === 1) window.open(d.item.object.url, '_blank');
          else window.location.href = d.item.object.url;
        }
        return;
      }
      this.render();
      if (d.kind !== 'pan') this.renderPanel();
    }

    updateTooltip(e) {
      const itemEl = e.target.closest && e.target.closest('.fp-item');
      const i = itemEl ? this.itemByUid(+itemEl.dataset.uid) : null;
      if (!i || (this.edit && !i.object)) { this.tooltip.hidden = true; return; }
      const o = i.object || {};
      const rows = [
        html('strong', { text: this.itemText(i) || this.cfg.types[i.item_type] }),
        html('div', { class: 'fp-muted', text: this.cfg.types[i.item_type] + ` · ${roomSize(i.width, i.height)} m` }),
      ];
      if (o.status_label) rows.push(html('div', {}, [this.t('Status') + ': ', html('span', { class: 'badge text-bg-' + (o.status_color || 'secondary'), text: o.status_label })]));
      if (o.role) rows.push(html('div', { text: this.t('Role') + ': ' + o.role }));
      if (o.tenant) rows.push(html('div', { text: this.t('Tenant') + ': ' + o.tenant }));
      if (o.u_height) rows.push(html('div', { text: this.t('Height (U)') + ': ' + o.u_height }));
      if (o.device_count !== undefined && o.device_count !== null) rows.push(html('div', { text: this.t('Devices in rack') + ': ' + o.device_count }));
      this.tooltip.replaceChildren(...rows);
      const r = this.canvasWrap.getBoundingClientRect();
      this.tooltip.hidden = false;
      const tx = Math.min(e.clientX - r.left + 14, r.width - this.tooltip.offsetWidth - 8);
      const ty = Math.min(e.clientY - r.top + 14, r.height - this.tooltip.offsetHeight - 8);
      this.tooltip.style.left = Math.max(4, tx) + 'px';
      this.tooltip.style.top = Math.max(4, ty) + 'px';
    }

    focusHighlight(key) {
      const [kind, id] = key.split('-');
      const i = this.items.find((it) => it[kind] === +id);
      if (!i) return;
      this.highlightUid = i.uid;
      const r = this.svg.getBoundingClientRect();
      const b = this.bbox(i);
      this.view.scale = this.baseScale() * 2.5;
      this.view.x = r.width / 2 - ((b.x1 + b.x2) / 2) * this.view.scale;
      this.view.y = r.height / 2 - ((b.y1 + b.y2) / 2) * this.view.scale;
      this.applyView();
    }

    /* ----- export / fullscreen ----- */

    async exportClone() {
      const clone = this.svg.cloneNode(true);
      const m = Math.max(20, this.dimFontSize() * 2);
      clone.setAttribute('viewBox', `${-m} ${-m} ${this.settings.width + 2 * m} ${this.settings.depth + 2 * m}`);
      clone.setAttribute('width', this.settings.width + 2 * m);
      clone.setAttribute('height', this.settings.depth + 2 * m);
      clone.querySelector('.fp-viewport').removeAttribute('transform');
      clone.querySelector('.fp-overlay').remove();
      if (!this.gridVisible) clone.querySelector(`rect[fill="url(#${this.gridId})"]`).remove();
      clone.querySelectorAll('.fp-dimmed').forEach((n) => n.setAttribute('opacity', 0.2));
      const img = clone.querySelector('image');
      if (img && this.cfg.background && this.cfg.background.url) {
        try {
          const resp = await fetch(this.cfg.background.url, { credentials: 'same-origin' });
          img.setAttribute('href', await blobToDataUrl(await resp.blob()));
        } catch (e) {
          img.remove();
        }
      } else if (img) {
        img.remove();
      }
      return clone;
    }

    filename(ext) {
      return (this.cfg.name || 'floorplan').replace(/[^\w.-]+/g, '_') + '.' + ext;
    }

    async exportSvg() {
      const clone = await this.exportClone();
      download(this.filename('svg'), new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    }

    async exportPng() {
      const clone = await this.exportClone();
      const w = +clone.getAttribute('width'), h = +clone.getAttribute('height');
      const scale = clamp(4000 / Math.max(w, h), 0.5, 4);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const canvas = html('canvas', { width: Math.round(w * scale), height: Math.round(h * scale) });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = this.cssVar('--fp-bg', '#ffffff');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => download(this.filename('png'), blob), 'image/png');
      };
      img.src = url;
    }

    toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen && this.root.requestFullscreen();
    }
  }

  function init() {
    document.querySelectorAll('.fp-root[data-fp-config]').forEach((root) => {
      if (root.dataset.fpReady) return;
      const cfgEl = document.getElementById(root.dataset.fpConfig);
      if (!cfgEl) return;
      root.dataset.fpReady = '1';
      root.floorplanner = new Designer(root, JSON.parse(cfgEl.textContent));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
