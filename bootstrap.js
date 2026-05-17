/* global APP_SHUTDOWN, ChromeUtils, Services, Zotero */

var MonthlyStats = {
  addon: null,
  services: null,
  menuItemId: "monthly-stats-menuitem",
  tabBarId: "monthly-stats-tabbar",
  panelRootId: "monthly-stats-left-panel",
  htmlNS: "http://www.w3.org/1999/xhtml",
  windowListener: null,
  windowState: new WeakMap(),

  startup(addon) {
    this.addon = addon;
    this.services = this.getServices();
    if (!this.services) {
      Zotero.debug("[monthly-stats] Services unavailable; continuing with Zotero window hooks only");
    }
    this.installInExistingWindows();
    this.registerWindowListener();
  },

  shutdown() {
    this.unregisterWindowListener();
    this.removeFromExistingWindows();
    this.services = null;
    this.addon = null;
  },

  getServices() {
    if (typeof Services !== "undefined" && Services) {
      return Services;
    }

    if (typeof ChromeUtils !== "undefined" && ChromeUtils.importESModule) {
      try {
        return ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
      } catch (e) {
        Zotero.debug("[monthly-stats] import Services.sys.mjs failed: " + e);
      }
    }

    return null;
  },

  registerWindowListener() {
    if (!this.services?.wm) {
      return;
    }

    this.windowListener = {
      onOpenWindow: (xulWindow) => {
        let win = xulWindow.docShell.domWindow;
        win.addEventListener(
          "load",
          () => {
            if (this.isZoteroMainWindow(win)) {
              this.installInWindow(win);
            }
          },
          { once: true }
        );
      },
      onCloseWindow: () => {},
      onWindowTitleChange: () => {},
    };

    this.services?.wm?.addListener(this.windowListener);
  },

  unregisterWindowListener() {
    if (this.windowListener) {
      this.services?.wm?.removeListener(this.windowListener);
      this.windowListener = null;
    }
  },

  installInExistingWindows() {
    let mainWindows = this.getMainWindows();
    if (mainWindows.length) {
      for (let win of mainWindows) {
        if (this.isZoteroMainWindow(win)) {
          this.installInWindow(win);
        }
      }
      return;
    }

    let enumerator = this.services?.wm?.getEnumerator(null);
    if (!enumerator) {
      return;
    }
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (this.isZoteroMainWindow(win)) {
        this.installInWindow(win);
      }
    }
  },

  removeFromExistingWindows() {
    let mainWindows = this.getMainWindows();
    if (mainWindows.length) {
      for (let win of mainWindows) {
        if (this.isZoteroMainWindow(win)) {
          this.removeFromWindow(win);
        }
      }
      return;
    }

    let enumerator = this.services?.wm?.getEnumerator(null);
    if (!enumerator) {
      return;
    }
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (this.isZoteroMainWindow(win)) {
        this.removeFromWindow(win);
      }
    }
  },

  getMainWindows() {
    try {
      if (typeof Zotero !== "undefined" && Zotero.getMainWindows) {
        return Zotero.getMainWindows() || [];
      }
    } catch (e) {
      Zotero.debug("[monthly-stats] Zotero.getMainWindows failed: " + e);
    }

    return [];
  },

  isZoteroMainWindow(win) {
    try {
      return (
        !!win &&
        !!win.document &&
        win.document.documentURI === "chrome://zotero/content/zoteroPane.xhtml"
      );
    } catch (e) {
      return false;
    }
  },

  findCollectionsTree(win) {
    let doc = win.document;
    let selectors = [
      "#zotero-collections-tree",
      "#collections-tree",
      "tree#zotero-collections-tree",
      "tree#collections-tree",
      "#zotero-collections-tree-container tree",
      "#zotero-collections-pane tree",
    ];

    for (let selector of selectors) {
      let node = doc.querySelector(selector);
      if (node) {
        return node;
      }
    }

    return null;
  },

  installInWindow(win) {
    if (this.windowState.get(win)) {
      return;
    }

    let doc = win.document;
    let tree = this.findCollectionsTree(win);
    if (!tree || !tree.parentElement || !tree.parentElement.parentElement) {
      Zotero.debug("[monthly-stats] collections tree not found");
      this.installMenuItem(win);
      return;
    }

    let treeHost = tree.parentElement;
    let hostParent = treeHost.parentElement;

    let tabBar = doc.createXULElement("hbox");
    tabBar.id = this.tabBarId;
    tabBar.setAttribute(
      "style",
      "display:flex;gap:6px;padding:4px 6px 6px;border-bottom:1px solid var(--material-border,#d8d8d8);"
    );

    let collectionsTab = doc.createXULElement("toolbarbutton");
    collectionsTab.label = "集合";
    collectionsTab.setAttribute("style", this.tabButtonStyle(true));

    let statsTab = doc.createXULElement("toolbarbutton");
    statsTab.label = "统计";
    statsTab.setAttribute("style", this.tabButtonStyle(false));

    tabBar.appendChild(collectionsTab);
    tabBar.appendChild(statsTab);

    let statsPanel = doc.createXULElement("vbox");
    statsPanel.id = this.panelRootId;
    statsPanel.setAttribute("flex", "1");
    statsPanel.setAttribute("style", "display:none;min-height:260px;overflow:auto;");

    hostParent.insertBefore(tabBar, treeHost);
    hostParent.insertBefore(statsPanel, treeHost.nextSibling);

    let state = {
      tree,
      treeHost,
      hostParent,
      tabBar,
      collectionsTab,
      statsTab,
      statsPanel,
      menuItem: null,
      activeTab: "collections",
      selectedCollectionID: null,
      selectedDay: null,
      payload: null,
      allSeries: [],
      allDaily: [],
      ui: null,
      loadSeq: 0,
    };

    collectionsTab.addEventListener("command", () => this.switchTab(win, "collections"));
    statsTab.addEventListener("command", () => this.switchTab(win, "stats"));

    this.windowState.set(win, state);
    this.installMenuItem(win);
    this.buildStatsUI(win);
    this.switchTab(win, "collections");
  },

  removeFromWindow(win) {
    let state = this.windowState.get(win);
    if (state) {
      if (state.tabBar?.parentElement) {
        state.tabBar.remove();
      }
      if (state.statsPanel?.parentElement) {
        state.statsPanel.remove();
      }
      if (state.treeHost) {
        state.treeHost.style.display = "";
      }
    }

    let menuNode = win.document.getElementById(this.menuItemId);
    if (menuNode) {
      menuNode.remove();
    }

    this.windowState.delete(win);
  },

  tabButtonStyle(active) {
    if (active) {
      return "padding:4px 10px;border-radius:8px;background:#0f766e;color:white;border:1px solid #0f766e;";
    }
    return "padding:4px 10px;border-radius:8px;background:#f3f3f3;color:#243746;border:1px solid #d4d4d4;";
  },

  switchTab(win, tabName) {
    let state = this.windowState.get(win);
    if (!state) {
      return;
    }

    let showStats = tabName === "stats";
    state.activeTab = showStats ? "stats" : "collections";

    state.treeHost.style.display = showStats ? "none" : "";
    state.statsPanel.style.display = showStats ? "flex" : "none";

    state.collectionsTab.setAttribute("style", this.tabButtonStyle(!showStats));
    state.statsTab.setAttribute("style", this.tabButtonStyle(showStats));

    if (showStats) {
      this.refreshStatsData(win, false);
    }
  },

  installMenuItem(win) {
    let doc = win.document;
    if (doc.getElementById(this.menuItemId)) {
      return;
    }

    let toolsPopup =
      doc.getElementById("menu_ToolsPopup") ||
      doc.getElementById("menuToolsPopup") ||
      doc.querySelector("#menu_ToolsPopup, #menuToolsPopup");

    if (!toolsPopup) {
      return;
    }

    let menuitem = doc.createXULElement("menuitem");
    menuitem.id = this.menuItemId;
    menuitem.label = "Monthly Literature Stats";
    menuitem.addEventListener("command", () => {
      if (!this.windowState.get(win)) {
        this.installInWindow(win);
      }
      this.switchTab(win, "stats");
    });
    toolsPopup.appendChild(menuitem);

    let state = this.windowState.get(win);
    if (state) {
      state.menuItem = menuitem;
    }
  },

  parseDateAdded(dateStr) {
    if (!dateStr || typeof dateStr !== "string") {
      return null;
    }

    let isoLike = dateStr.replace(" ", "T") + "Z";
    let d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) {
      d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) {
        return null;
      }
    }

    return d;
  },

  formatMonthKey(date) {
    let y = date.getUTCFullYear();
    let m = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  },

  formatDayKey(date) {
    let y = date.getUTCFullYear();
    let m = String(date.getUTCMonth() + 1).padStart(2, "0");
    let d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  getSelectedLibraryID(win) {
    try {
      let id = win.ZoteroPane?.getSelectedLibraryID?.();
      if (Number.isInteger(id)) {
        return id;
      }
    } catch (e) {}
    return Zotero.Libraries?.userLibraryID || 1;
  },

  getSelectedCollectionID(win) {
    try {
      let collection = win.ZoteroPane?.getSelectedCollection?.();
      if (collection?.id) {
        return collection.id;
      }
    } catch (e) {}
    return null;
  },

  async getCollections(libraryID) {
    let rows = (await Zotero.DB.queryAsync(
      `SELECT collectionID, collectionName, parentCollectionID
       FROM collections
       WHERE libraryID = ?`,
      [libraryID]
    )) || [];

    let byParent = new Map();
    for (let row of rows) {
      let parent = row.parentCollectionID || 0;
      if (!byParent.has(parent)) {
        byParent.set(parent, []);
      }
      byParent.get(parent).push(row);
    }

    for (let list of byParent.values()) {
      list.sort((a, b) => String(a.collectionName).localeCompare(String(b.collectionName), "zh-Hans-CN"));
    }

    let result = [];
    let walk = (parentID, depth) => {
      let children = byParent.get(parentID) || [];
      for (let row of children) {
        result.push({
          id: row.collectionID,
          name: row.collectionName,
          label: `${"  ".repeat(depth)}${row.collectionName}`,
        });
        walk(row.collectionID, depth + 1);
      }
    };

    walk(0, 0);
    return result;
  },

  async getCollectionSubtreeIDs(libraryID, rootCollectionID) {
    if (!rootCollectionID) {
      return [];
    }

    let rows = (await Zotero.DB.queryAsync(
      `SELECT collectionID, parentCollectionID
       FROM collections
       WHERE libraryID = ?`,
      [libraryID]
    )) || [];

    let byParent = new Map();
    for (let row of rows) {
      let parent = row.parentCollectionID || 0;
      if (!byParent.has(parent)) {
        byParent.set(parent, []);
      }
      byParent.get(parent).push(row.collectionID);
    }

    let ids = [];
    let stack = [rootCollectionID];
    let seen = new Set();

    while (stack.length) {
      let id = stack.pop();
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);

      let children = byParent.get(id) || [];
      for (let child of children) {
        stack.push(child);
      }
    }

    return ids;
  },

  async getMonthlySeries(win, collectionID) {
    let libraryID = this.getSelectedLibraryID(win);
    let params = [libraryID];

    let sql =
      `SELECT i.itemID, i.dateAdded, i.itemTypeID\n` +
      `FROM items i\n` +
      `LEFT JOIN deletedItems d ON d.itemID = i.itemID\n` +
      `WHERE i.libraryID = ?\n` +
      `AND d.itemID IS NULL`;

    if (collectionID) {
      let subtreeIDs = await this.getCollectionSubtreeIDs(libraryID, collectionID);
      if (!subtreeIDs.length) {
        return {
          libraryID,
          collectionID,
          series: [],
        };
      }

      let placeholders = subtreeIDs.map(() => "?").join(",");
      sql += `\nAND i.itemID IN (SELECT itemID FROM collectionItems WHERE collectionID IN (${placeholders}))`;
      params.push(...subtreeIDs);
    }

    let rows = (await Zotero.DB.queryAsync(sql, params)) || [];
    let countsByMonth = new Map();
    let countsByDay = new Map();
    let parsedRows = 0;
    let invalidDateRows = 0;
    let filteredTypeRows = 0;

    for (let row of rows) {
      let typeName = "";
      try {
        typeName = (Zotero.ItemTypes.getName(row.itemTypeID) || "").toLowerCase();
      } catch (e) {
        typeName = "";
      }
      if (typeName === "attachment" || typeName === "note" || typeName === "annotation") {
        filteredTypeRows += 1;
        continue;
      }

      let d = this.parseDateAdded(row.dateAdded);
      if (!d) {
        invalidDateRows += 1;
        continue;
      }
      parsedRows += 1;

      let key = this.formatMonthKey(d);
      countsByMonth.set(key, (countsByMonth.get(key) || 0) + 1);
      let dayKey = this.formatDayKey(d);
      countsByDay.set(dayKey, (countsByDay.get(dayKey) || 0) + 1);
    }

    let keys = Array.from(countsByMonth.keys()).sort();
    let dayKeys = Array.from(countsByDay.keys()).sort();
    let series = this.makeContinuousSeries(keys, countsByMonth);
    let dailySeries = this.makeContinuousDailySeries(dayKeys, countsByDay);

    return {
      libraryID,
      collectionID,
      series,
      dailySeries,
      debug: {
        rawRows: rows.length,
        parsedRows,
        invalidDateRows,
        filteredTypeRows,
      },
    };
  },

  makeContinuousSeries(keys, countsByMonth) {
    if (!keys.length) {
      return [];
    }

    let [startY, startM] = keys[0].split("-").map((v) => parseInt(v, 10));
    let [endY, endM] = keys[keys.length - 1].split("-").map((v) => parseInt(v, 10));

    let cursorY = startY;
    let cursorM = startM;
    let series = [];

    while (cursorY < endY || (cursorY === endY && cursorM <= endM)) {
      let key = `${cursorY}-${String(cursorM).padStart(2, "0")}`;
      series.push({
        month: key,
        count: countsByMonth.get(key) || 0,
      });

      cursorM += 1;
      if (cursorM > 12) {
        cursorM = 1;
        cursorY += 1;
      }
    }

    return series;
  },

  makeContinuousDailySeries(keys, countsByDay) {
    if (!keys.length) {
      return [];
    }

    let start = new Date(keys[0] + "T00:00:00Z");
    let end = new Date(keys[keys.length - 1] + "T00:00:00Z");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return [];
    }

    let series = [];
    let cursor = new Date(start.getTime());
    while (cursor <= end) {
      let day = this.formatDayKey(cursor);
      series.push({
        day,
        count: countsByDay.get(day) || 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return series;
  },

  async buildPanelPayload(win, selectedCollectionID) {
    try {
      let libraryID = this.getSelectedLibraryID(win);
      let collections = await this.getCollections(libraryID);

      let collectionID = selectedCollectionID;
      if (collectionID === "ALL" || collectionID === null || collectionID === undefined) {
        collectionID = null;
      } else if (typeof collectionID === "string") {
        collectionID = parseInt(collectionID, 10);
      } else if (typeof collectionID !== "number") {
        collectionID = null;
      }

      let monthly = await this.getMonthlySeries(win, collectionID);

      return {
        libraryID: monthly.libraryID,
        collectionID,
        collections,
        series: monthly.series,
        dailySeries: monthly.dailySeries,
        debug: monthly.debug,
        defaultRange: Zotero.Prefs.get("extensions.monthly-stats.defaultRange", true) || "12m",
        defaultView: Zotero.Prefs.get("extensions.monthly-stats.defaultView", true) || "bar",
        error: "",
      };
    } catch (e) {
      let msg = String(e && e.message ? e.message : e);
      Zotero.debug("[monthly-stats] build payload failed: " + msg);
      return {
        libraryID: this.getSelectedLibraryID(win),
        collectionID: null,
        collections: [],
        series: [],
        dailySeries: [],
        debug: {
          rawRows: 0,
          parsedRows: 0,
          invalidDateRows: 0,
          filteredTypeRows: 0,
        },
        defaultRange: "12m",
        defaultView: "bar",
        error: msg,
      };
    }
  },

  makeEl(doc, tag, styleText) {
    let el = doc.createElementNS(this.htmlNS, tag);
    if (styleText) {
      el.setAttribute("style", styleText);
    }
    return el;
  },

  buildStatsUI(win) {
    let state = this.windowState.get(win);
    if (!state || state.ui) {
      return;
    }

    let doc = win.document;
    state.statsPanel.replaceChildren();

    let wrap = this.makeEl(doc, "div", "padding:14px;background:#f0f4f3;min-height:280px;");

    let header = this.makeEl(
      doc,
      "div",
      "border-radius:16px;background:#fff;padding:16px 18px;margin-bottom:10px;box-shadow:0 2px 12px rgba(47,74,70,0.07);border:1px solid rgba(200,212,208,0.4);"
    );

    let title = this.makeEl(doc, "div", "margin:0 0 10px 0;font-size:18px;font-weight:700;color:#1a3530;");
    title.textContent = "文献添加统计";

    let sub = this.makeEl(doc, "div", "color:#7a9e9a;font-size:11px;margin-bottom:12px;letter-spacing:0.2px;");

    let controls = this.makeEl(doc, "div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;");
    let dayFocusBar = this.makeEl(
      doc,
      "div",
      "display:flex;align-items:center;gap:8px;margin-top:6px;"
    );

    let selectStyle = "height:26px;border:1px solid #7ab0a8;border-radius:14px;background:#e8f2f0;padding:0 24px 0 10px;font-size:12px;color:#1a3530;outline:none;min-width:110px;appearance:none;-moz-appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, #e8f2f0 50%),linear-gradient(135deg, #e8f2f0 50%, transparent 50%),linear-gradient(to right, #0f766e, #0f766e);background-position:calc(100% - 13px) 50%,calc(100% - 8px) 50%,100% 0;background-size:4px 4px,4px 4px,20px 100%;background-repeat:no-repeat;";
    let collectionSelect = this.makeEl(doc, "select", selectStyle + "min-width:120px;max-width:200px;");
    let viewSelect = this.makeEl(doc, "select", selectStyle + "min-width:100px;");
    let rangeSelect = this.makeEl(doc, "select", selectStyle + "min-width:110px;");
    let startMonth = this.makeEl(doc, "input", "height:26px;border:1px solid #7ab0a8;border-radius:14px;background:#fff;padding:0 8px;font-size:12px;color:#2f4a46;outline:none;");
    let endMonth = this.makeEl(doc, "input", "height:26px;border:1px solid #7ab0a8;border-radius:14px;background:#fff;padding:0 8px;font-size:12px;color:#2f4a46;outline:none;");
    startMonth.setAttribute("type", "month");
    endMonth.setAttribute("type", "month");

    let applyBtn = this.makeEl(doc, "button", "height:26px;border:none;border-radius:14px;background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;padding:0 14px;font-size:12px;cursor:pointer;font-weight:500;letter-spacing:0.2px;box-shadow:0 1px 6px rgba(15,118,110,0.22);transition:opacity 0.15s;");
    applyBtn.textContent = "应用";
    let clearDayBtn = this.makeEl(
      doc,
      "button",
      "height:24px;border:none;border-radius:12px;background:rgba(15,118,110,0.08);color:#0f766e;padding:0 10px;font-size:11px;cursor:pointer;display:none;"
    );
    clearDayBtn.textContent = "清除焦点";
    let granToggle = this.makeEl(
      doc,
      "button",
      "height:26px;border:1px solid #b8d4d0;border-radius:14px;background:#fff;color:#0f766e;padding:0 10px;font-size:12px;cursor:pointer;display:none;font-weight:500;"
    );
    granToggle.textContent = "按月";
    let dayFocusText = this.makeEl(doc, "span", "font-size:11px;color:#7a9e9a;");

    this.appendOptions(viewSelect, [
      { value: "heatmap", label: "打卡热力图" },
      { value: "bar", label: "柱状图" },
      { value: "line", label: "折线图" },
    ]);

    this.appendOptions(rangeSelect, [
      { value: "3m", label: "近 3 个月" },
      { value: "6m", label: "近 6 个月" },
      { value: "12m", label: "近 12 个月" },
      { value: "24m", label: "近 24 个月" },
      { value: "all", label: "全部" },
      { value: "custom", label: "自定义" },
    ]);

    controls.appendChild(this.wrapLabeledControl(doc, "集合", collectionSelect));
    controls.appendChild(this.wrapLabeledControl(doc, "视图", viewSelect));
    controls.appendChild(this.wrapLabeledControl(doc, "范围", rangeSelect));
    controls.appendChild(this.wrapLabeledControl(doc, "从", startMonth));
    controls.appendChild(this.wrapLabeledControl(doc, "到", endMonth));
    controls.appendChild(granToggle);
    controls.appendChild(applyBtn);

    header.appendChild(title);
    header.appendChild(sub);
    header.appendChild(controls);
    dayFocusBar.appendChild(dayFocusText);
    dayFocusBar.appendChild(clearDayBtn);
    header.appendChild(dayFocusBar);

    let panel = this.makeEl(
      doc,
      "div",
      "border-radius:16px;background:#fff;padding:16px 18px;box-shadow:0 2px 12px rgba(47,74,70,0.07);border:1px solid rgba(200,212,208,0.4);"
    );

    let summary = this.makeEl(doc, "div", "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px;");
    let totalCard = this.createSummaryCard(doc, "文献总数", "#e8f5f4", "#0f766e", "16px");
    let avgCard = this.createSummaryCard(doc, "月均新增", "#f0f7f4", "#14b8a6", "16px");
    let peakCard = this.createSummaryCard(doc, "峰值日期", "#faf5e8", "#d97706", "12px");
    peakCard.card.style.minHeight = "62px";
    peakCard.value.style.whiteSpace = "pre-line";
    peakCard.value.style.lineHeight = "1.08";
    peakCard.value.style.overflow = "hidden";
    peakCard.value.style.wordBreak = "break-word";
    peakCard.value.style.maxWidth = "100%";

    summary.appendChild(totalCard.card);
    summary.appendChild(avgCard.card);
    summary.appendChild(peakCard.card);

    let chart = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("viewBox", "0 0 960 340");
    chart.setAttribute("preserveAspectRatio", "none");
    chart.setAttribute(
      "style",
      "width:100%;height:300px;display:block;border-radius:12px;background:#fafcff;border:1px solid rgba(200,212,208,0.4);"
    );

    let foot = this.makeEl(doc, "div", "margin-top:10px;color:#7a9e9a;font-size:11px;letter-spacing:0.2px;");

    panel.appendChild(summary);
    panel.appendChild(chart);
    panel.appendChild(foot);

    wrap.appendChild(header);
    wrap.appendChild(panel);
    state.statsPanel.appendChild(wrap);

    state.ui = {
      wrap,
      sub,
      collectionSelect,
      viewSelect,
      rangeSelect,
      startMonth,
      endMonth,
      applyBtn,
      clearDayBtn,
      granToggle,
      dayFocusText,
      totalValue: totalCard.value,
      avgValue: avgCard.value,
      peakValue: peakCard.value,
      peakTitle: peakCard.title,
      chart,
      foot,
    };

    viewSelect.addEventListener("change", () => {
      this.savePref("extensions.monthly-stats.defaultView", viewSelect.value);
      this.renderStats(win);
    });

    rangeSelect.addEventListener("change", () => {
      if (rangeSelect.value !== "custom") {
        this.savePref("extensions.monthly-stats.defaultRange", rangeSelect.value);
      }
      this.renderStats(win);
    });

    let onApply = () => this.renderStats(win, true);
    applyBtn.addEventListener("click", onApply);
    applyBtn.addEventListener("command", onApply);

    collectionSelect.addEventListener("change", () => {
      let raw = collectionSelect.value;
      state.selectedCollectionID = raw === "" ? "ALL" : parseInt(raw, 10);
      this.refreshStatsData(win, true);
    });

    clearDayBtn.addEventListener("click", () => {
      state.selectedDay = null;
      this.renderStats(win, true);
    });
    clearDayBtn.addEventListener("command", () => {
      state.selectedDay = null;
      this.renderStats(win, true);
    });

    state.heatGran = "day";
    granToggle.addEventListener("click", () => {
      state.heatGran = state.heatGran === "day" ? "month" : "day";
      granToggle.textContent = state.heatGran === "day" ? "按月" : "按天";
      this.renderStats(win, false);
    });
    granToggle.addEventListener("command", () => {
      state.heatGran = state.heatGran === "day" ? "month" : "day";
      granToggle.textContent = state.heatGran === "day" ? "按月" : "按天";
      this.renderStats(win, false);
    });
  },

  wrapLabeledControl(doc, label, control) {
    let wrap = this.makeEl(doc, "label", "display:inline-flex;gap:4px;align-items:center;color:#1d2a34;font-size:12px;");
    let text = this.makeEl(doc, "span", "");
    text.textContent = label;
    wrap.appendChild(text);
    wrap.appendChild(control);
    return wrap;
  },

  createSummaryCard(doc, titleText, bgColor, accentColor, fontSize) {
    let card = this.makeEl(doc, "div", `border-radius:12px;background:${bgColor};padding:10px 12px 8px;border:none;min-height:62px;display:flex;flex-direction:column;justify-content:flex-start;`);
    let k = this.makeEl(doc, "div", "color:#7a9e9a;font-size:11px;letter-spacing:0.3px;font-weight:500;");
    k.textContent = titleText;
    let v = this.makeEl(doc, "div", `font-size:${fontSize};font-weight:700;margin-top:3px;color:${accentColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;`);
    v.textContent = "—";
    card.appendChild(k);
    card.appendChild(v);
    return { card, value: v, title: k };
  },

  appendOptions(selectEl, list) {
    for (let item of list) {
      let opt = selectEl.ownerDocument.createElementNS(this.htmlNS, "option");
      opt.value = item.value;
      opt.textContent = item.label;
      selectEl.appendChild(opt);
    }
  },

  savePref(name, value) {
    try {
      Zotero.Prefs.set(name, value, true);
    } catch (e) {
      Zotero.debug("[monthly-stats] save pref failed: " + e);
    }
  },

  populateCollectionSelect(state, collections, selectedID) {
    let select = state.ui.collectionSelect;
    select.replaceChildren();

    let doc = select.ownerDocument;
    let allOpt = doc.createElementNS(this.htmlNS, "option");
    allOpt.value = "";
    allOpt.textContent = "全部集合";
    select.appendChild(allOpt);

    for (let c of collections) {
      let opt = doc.createElementNS(this.htmlNS, "option");
      opt.value = String(c.id);
      opt.textContent = c.label;
      select.appendChild(opt);
    }

    if (typeof selectedID === "number") {
      select.value = String(selectedID);
    } else {
      select.value = "";
    }
  },

  async refreshStatsData(win, resetRange) {
    let state = this.windowState.get(win);
    if (!state || !state.ui) {
      return;
    }
    let ui = state.ui;
    let seq = ++state.loadSeq;
    ui.sub.textContent = "正在读取 Zotero 数据...";
    ui.foot.textContent = "加载中...";

    let payload = await this.buildPanelPayload(win, state.selectedCollectionID);
    if (seq !== state.loadSeq) {
      return;
    }
    state.payload = payload;

    let exists = payload.collections.some((c) => c.id === payload.collectionID);
    if (!exists) {
      payload.collectionID = null;
      state.selectedCollectionID = null;
      payload = await this.buildPanelPayload(win, null);
      if (seq !== state.loadSeq) {
        return;
      }
      state.payload = payload;
    }

    state.selectedCollectionID = payload.collectionID;
    state.allSeries = payload.series || [];
    state.allDaily = payload.dailySeries || [];
    if (state.selectedDay && !state.allDaily.some((d) => d.day === state.selectedDay)) {
      state.selectedDay = null;
    }

    this.populateCollectionSelect(state, payload.collections || [], payload.collectionID);

    if (!ui.viewSelect.value) {
      let okView = ["bar", "line", "heatmap"].includes(payload.defaultView);
      ui.viewSelect.value = okView ? payload.defaultView : "heatmap";
    }
    if (!ui.rangeSelect.value) {
      let okRange = ["3m", "6m", "12m", "24m", "all"].includes(payload.defaultRange);
      ui.rangeSelect.value = okRange ? payload.defaultRange : "12m";
    }

    if (state.allSeries.length) {
      if (resetRange || !ui.startMonth.value || !ui.endMonth.value) {
        ui.startMonth.value = state.allSeries[0].month;
        ui.endMonth.value = state.allSeries[state.allSeries.length - 1].month;
      }
    } else {
      ui.startMonth.value = "";
      ui.endMonth.value = "";
    }

    this.renderStats(win);
  },

  filterDailyByMonths(dailySeries, filteredMonths) {
    if (!dailySeries.length || !filteredMonths.length) {
      return [];
    }
    let startMonth = filteredMonths[0].month;
    let endMonth = filteredMonths[filteredMonths.length - 1].month;
    return dailySeries.filter((d) => {
      let month = d.day.slice(0, 7);
      return month >= startMonth && month <= endMonth;
    });
  },

  filterByRange(series, rangeMode, startMonth, endMonth) {
    if (!series.length) {
      return [];
    }

    if (rangeMode === "all") {
      return series.slice();
    }

    if (rangeMode === "custom") {
      if (!startMonth || !endMonth) {
        return [];
      }
      let start = startMonth <= endMonth ? startMonth : endMonth;
      let end = startMonth <= endMonth ? endMonth : startMonth;
      return series.filter((p) => p.month >= start && p.month <= end);
    }

    let months = parseInt(rangeMode, 10);
    if (!months || months < 1) {
      return series.slice();
    }

    return series.slice(Math.max(0, series.length - months));
  },

  summarize(series) {
    let total = 0;
    let peak = null;
    for (let p of series) {
      total += Number(p.count) || 0;
      if (!peak || p.count > peak.count) {
        peak = p;
      }
    }

    let avg = series.length ? total / series.length : 0;
    return { total, avg, peak };
  },

  clearSvg(svg) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
  },

  drawGrid(svg, maxY) {
    let ns = "http://www.w3.org/2000/svg";
    let left = 48;
    let top = 16;
    let width = 900;
    let height = 265;
    let ticks = 5;

    for (let i = 0; i <= ticks; i++) {
      let y = top + (height / ticks) * i;

      let line = svg.ownerDocument.createElementNS(ns, "line");
      line.setAttribute("x1", left);
      line.setAttribute("x2", left + width);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "#e8dfd0");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      let value = Math.round(maxY - (maxY / ticks) * i);
      let label = svg.ownerDocument.createElementNS(ns, "text");
      label.setAttribute("x", 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("fill", "#6f7c86");
      label.setAttribute("font-size", "11");
      label.textContent = String(value);
      svg.appendChild(label);
    }

    let axis = svg.ownerDocument.createElementNS(ns, "line");
    axis.setAttribute("x1", left);
    axis.setAttribute("x2", left + width);
    axis.setAttribute("y1", top + height);
    axis.setAttribute("y2", top + height);
    axis.setAttribute("stroke", "#bcae95");
    axis.setAttribute("stroke-width", "1.2");
    svg.appendChild(axis);
  },

  drawMonthLabels(svg, series, mode) {
    let ns = "http://www.w3.org/2000/svg";
    let left = 48;
    let top = 16;
    let width = 900;
    let height = 265;
    let labelCount = Math.min(8, series.length);
    let gap = Math.max(1, Math.floor(series.length / labelCount));

    for (let i = 0; i < series.length; i += gap) {
      let x;
      if (mode === "bar") {
        let step = width / Math.max(series.length, 1);
        x = left + i * step + step / 2;
      } else {
        x = left + (width * i) / Math.max(series.length - 1, 1);
      }
      let t = svg.ownerDocument.createElementNS(ns, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", top + height + 16);
      t.setAttribute("font-size", "10");
      t.setAttribute("fill", "#7f8c95");
      t.setAttribute("text-anchor", "middle");
      t.textContent = series[i].month;
      svg.appendChild(t);
    }
  },

  drawBars(svg, series) {
    let ns = "http://www.w3.org/2000/svg";
    let left = 48;
    let top = 16;
    let width = 900;
    let height = 265;

    let max = Math.max(1, ...series.map((p) => p.count));
    this.drawGrid(svg, max);

    let step = width / Math.max(series.length, 1);
    let barW = Math.max(2, step * 0.62);

    for (let i = 0; i < series.length; i++) {
      let p = series[i];
      let h = (p.count / max) * height;
      let x = left + i * step + (step - barW) / 2;
      let y = top + (height - h);

      let rect = svg.ownerDocument.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", "2");
      rect.setAttribute("fill", "#0f766e");
      rect.setAttribute("opacity", "0.9");
      svg.appendChild(rect);
    }

    this.drawMonthLabels(svg, series, "bar");
  },

  drawLine(svg, series) {
    let ns = "http://www.w3.org/2000/svg";
    let left = 48;
    let top = 16;
    let width = 900;
    let height = 265;

    let max = Math.max(1, ...series.map((p) => p.count));
    this.drawGrid(svg, max);

    let step = width / Math.max(series.length - 1, 1);
    let points = series.map((p, i) => {
      let x = left + i * step;
      let y = top + height - (p.count / max) * height;
      return { x, y };
    });

    let polyline = svg.ownerDocument.createElementNS(ns, "polyline");
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "#0f766e");
    polyline.setAttribute("stroke-width", "2.2");
    polyline.setAttribute("points", points.map((t) => t.x + "," + t.y).join(" "));
    svg.appendChild(polyline);

    for (let pt of points) {
      let c = svg.ownerDocument.createElementNS(ns, "circle");
      c.setAttribute("cx", pt.x);
      c.setAttribute("cy", pt.y);
      c.setAttribute("r", "2.3");
      c.setAttribute("fill", "#134e4a");
      svg.appendChild(c);
    }

    this.drawMonthLabels(svg, series, "line");
  },

  heatColor(count) {
    if (!count || count <= 0) return "#edf0ec";
    if (count >= 30) return "#0f766e";
    if (count >= 20) return "#1f8e82";
    if (count >= 12) return "#41a99f";
    if (count >= 6) return "#79c5be";
    return "#bfe3df";
  },

  heatColorMonthly(count) {
    if (!count || count <= 0) return "#edf0ec";
    if (count >= 300) return "#0f766e";
    if (count >= 200) return "#1f8e82";
    if (count >= 120) return "#41a99f";
    if (count >= 60) return "#79c5be";
    return "#bfe3df";
  },

  drawHeatmap(win, svg, dailySeries) {
    if (!dailySeries.length) {
      return;
    }

    let ns = "http://www.w3.org/2000/svg";
    let left = 78;
    let top = 22;
    let cell = 10;
    let gap = 2;
    let labelGap = 16;

    let byMonth = new Map();
    for (let d of dailySeries) {
      let month = d.day.slice(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, []);
      }
      byMonth.get(month).push(d);
    }

    let months = Array.from(byMonth.keys()).sort();
    let width = left + 31 * (cell + gap) + 20;
    let height = top + months.length * (cell + gap + labelGap) + 46;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.height = Math.max(220, height) + "px";
    let state = this.windowState.get(win);
    let selectedDay = state?.selectedDay || null;

    for (let i = 0; i < months.length; i++) {
      let month = months[i];
      let rowY = top + i * (cell + gap + labelGap);

      let monthText = svg.ownerDocument.createElementNS(ns, "text");
      monthText.setAttribute("x", left - 8);
      monthText.setAttribute("y", rowY + cell - 1);
      monthText.setAttribute("text-anchor", "end");
      monthText.setAttribute("font-size", "10");
      monthText.setAttribute("fill", "#64727d");
      monthText.textContent = month;
      svg.appendChild(monthText);

      let points = byMonth.get(month) || [];
      for (let p of points) {
        let dayOfMonth = parseInt(p.day.slice(8, 10), 10);
        if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) {
          continue;
        }
        let x = left + (dayOfMonth - 1) * (cell + gap);
        let rect = svg.ownerDocument.createElementNS(ns, "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", rowY);
        rect.setAttribute("width", cell);
        rect.setAttribute("height", cell);
        rect.setAttribute("rx", "1.5");
        rect.setAttribute("fill", this.heatColor(p.count));
        rect.setAttribute("opacity", "0.96");
        rect.setAttribute("cursor", "pointer");
        if (selectedDay === p.day) {
          rect.setAttribute("stroke", "#17212b");
          rect.setAttribute("stroke-width", "1.3");
        } else {
          rect.setAttribute("stroke", "transparent");
          rect.setAttribute("stroke-width", "0");
        }
        let title = svg.ownerDocument.createElementNS(ns, "title");
        title.textContent = `${p.day}: ${p.count} 篇`;
        rect.appendChild(title);
        rect.addEventListener("click", () => {
          let curState = this.windowState.get(win);
          if (!curState) {
            return;
          }
          curState.selectedDay = curState.selectedDay === p.day ? null : p.day;
          this.renderStats(win, true);
        });
        svg.appendChild(rect);
      }
    }

    let ticks = [1, 5, 10, 15, 20, 25, 31];
    let tickY = top - 6;
    for (let d of ticks) {
      let tx = left + (d - 1) * (cell + gap) + cell / 2;
      let t = svg.ownerDocument.createElementNS(ns, "text");
      t.setAttribute("x", tx);
      t.setAttribute("y", tickY);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", "9");
      t.setAttribute("fill", "#71808a");
      t.textContent = String(d);
      svg.appendChild(t);
    }

    let legendY = height - 14;
    let legendItems = [
      { label: "0", count: 0 },
      { label: "1-5", count: 3 },
      { label: "6-11", count: 7 },
      { label: "12-19", count: 14 },
      { label: "20-29", count: 24 },
      { label: "30+", count: 30 },
    ];
    let legendWidths = legendItems.map((item) => 14 + item.label.length * 6);
    let legendContentWidth = legendWidths.reduce((sum, itemWidth) => sum + itemWidth, 0);
    let legendSidePadding = 20;
    let legendGap = 18;
    let maxLegendWidth = Math.max(legendContentWidth, width - legendSidePadding * 2);
    if (legendItems.length > 1) {
      legendGap = Math.max(
        10,
        Math.min(18, (maxLegendWidth - legendContentWidth) / (legendItems.length - 1))
      );
    }
    let legendWidth = legendContentWidth + legendGap * (legendItems.length - 1);
    let lx = (width - legendWidth) / 2;
    for (let i = 0; i < legendItems.length; i++) {
      let item = legendItems[i];
      let box = svg.ownerDocument.createElementNS(ns, "rect");
      box.setAttribute("x", lx);
      box.setAttribute("y", legendY - 8);
      box.setAttribute("width", 8);
      box.setAttribute("height", 8);
      box.setAttribute("rx", "1");
      box.setAttribute("fill", this.heatColor(item.count));
      svg.appendChild(box);

      let text = svg.ownerDocument.createElementNS(ns, "text");
      text.setAttribute("x", lx + 12);
      text.setAttribute("y", legendY);
      text.setAttribute("font-size", "9");
      text.setAttribute("fill", "#65737e");
      text.textContent = item.label;
      svg.appendChild(text);
      lx += legendWidths[i] + legendGap;
    }
  },

  drawHeatmapMonthly(svg, series) {
    if (!series.length) {
      return;
    }

    let ns = "http://www.w3.org/2000/svg";
    let cell = 14;
    let gap = 2;
    let top = 24;
    let left = 52;

    let max = Math.max(1, ...series.map((p) => p.count));
    let gridWidth = 12 * cell + 11 * gap;
    let width = left + gridWidth + 30;
    let height = top + Math.ceil(series.length / 12) * (cell + gap + 14) + 30;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.height = Math.max(220, height) + "px";

    let yearGroups = new Map();
    for (let p of series) {
      let y = p.month.slice(0, 4);
      if (!yearGroups.has(y)) yearGroups.set(y, []);
      yearGroups.get(y).push(p);
    }
    let years = Array.from(yearGroups.keys()).sort();

    let curY = top;
    for (let year of years) {
      let group = yearGroups.get(year);
      let yRowH = cell + gap + 12;

      let yearLabel = svg.ownerDocument.createElementNS(ns, "text");
      yearLabel.setAttribute("x", left - 6);
      yearLabel.setAttribute("y", curY + cell / 2 + 4);
      yearLabel.setAttribute("text-anchor", "end");
      yearLabel.setAttribute("font-size", "10");
      yearLabel.setAttribute("fill", "#7a9e9a");
      yearLabel.setAttribute("font-weight", "600");
      yearLabel.textContent = year;
      svg.appendChild(yearLabel);

      for (let p of group) {
        let m = parseInt(p.month.slice(5), 10) - 1;
        let x = left + m * (cell + gap);
        let rect = svg.ownerDocument.createElementNS(ns, "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", curY);
        rect.setAttribute("width", cell);
        rect.setAttribute("height", cell);
        rect.setAttribute("rx", "2");
        rect.setAttribute("fill", this.heatColorMonthly(p.count));
        rect.setAttribute("opacity", "0.92");
        let title = svg.ownerDocument.createElementNS(ns, "title");
        title.textContent = `${p.month}: ${p.count} 篇`;
        rect.appendChild(title);
        svg.appendChild(rect);

        if (curY === top) {
          let monLabel = svg.ownerDocument.createElementNS(ns, "text");
          monLabel.setAttribute("x", x + cell / 2);
          monLabel.setAttribute("y", top - 4);
          monLabel.setAttribute("text-anchor", "middle");
          monLabel.setAttribute("font-size", "8");
          monLabel.setAttribute("fill", "#7a9e9a");
          monLabel.textContent = ["1","2","3","4","5","6","7","8","9","10","11","12"][m];
          svg.appendChild(monLabel);
        }
      }
      curY += yRowH;
    }

    let legendY = curY + 6;
    let legendItems = [
      { label: "0", count: 0 },
      { label: "1-59", count: 30 },
      { label: "60-119", count: 90 },
      { label: "120-199", count: 160 },
      { label: "200-299", count: 250 },
      { label: "300+", count: 300 },
    ];
    let legendWidths = legendItems.map((item) => 12 + item.label.length * 5);
    let legendGap = 10;
    let legendWidth = legendWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + legendGap * (legendItems.length - 1);
    width = Math.max(width, legendWidth + 48);
    height = Math.max(height, legendY + 18);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.height = Math.max(220, height) + "px";
    let lx = Math.max(24, (width - legendWidth) / 2);
    for (let i = 0; i < legendItems.length; i++) {
      let item = legendItems[i];
      let box = svg.ownerDocument.createElementNS(ns, "rect");
      box.setAttribute("x", lx);
      box.setAttribute("y", legendY);
      box.setAttribute("width", 8);
      box.setAttribute("height", 8);
      box.setAttribute("rx", "1");
      box.setAttribute("fill", this.heatColorMonthly(item.count));
      svg.appendChild(box);

      let text = svg.ownerDocument.createElementNS(ns, "text");
      text.setAttribute("x", lx + 11);
      text.setAttribute("y", legendY + 8);
      text.setAttribute("font-size", "8");
      text.setAttribute("fill", "#7a9e9a");
      text.textContent = item.label;
      svg.appendChild(text);
      lx += legendWidths[i] + legendGap;
    }
  },

  renderStats(win, fromApply) {
    let state = this.windowState.get(win);
    if (!state?.ui) {
      return;
    }

    let ui = state.ui;
    let filtered = this.filterByRange(
      state.allSeries,
      ui.rangeSelect.value,
      ui.startMonth.value,
      ui.endMonth.value
    );
    let filteredDaily = this.filterDailyByMonths(state.allDaily, filtered);
    let selectedDayData = null;
    let dayFocusCleared = false;
    if (state.selectedDay) {
      selectedDayData = filteredDaily.find((d) => d.day === state.selectedDay) || null;
      if (!selectedDayData) {
        state.selectedDay = null;
        dayFocusCleared = true;
      }
    }

    ui.sub.textContent =
      "Library ID: " +
      (state.payload?.libraryID || "-") +
      " | 数据点（月）: " +
      filtered.length +
      " | 条目行: " +
      (state.payload?.debug?.rawRows ?? 0) +
      " | 有效日期: " +
      (state.payload?.debug?.parsedRows ?? 0);

    this.clearSvg(ui.chart);
    ui.chart.setAttribute("viewBox", "0 0 960 340");
    ui.chart.style.height = "300px";

    let isHeatmap = ui.viewSelect.value === "heatmap";
    let canUseMonthlyGran = isHeatmap && filtered.length > 24;
    if (!canUseMonthlyGran && state.heatGran === "month") {
      state.heatGran = "day";
    }
    ui.granToggle.style.display = canUseMonthlyGran ? "" : "none";
    ui.granToggle.textContent = state.heatGran === "day" ? "按月" : "按天";
    ui.clearDayBtn.style.display = state.selectedDay ? "" : "none";
    if (state.selectedDay && selectedDayData) {
      ui.dayFocusText.textContent =
        "日焦点: " + selectedDayData.day + "（新增 " + selectedDayData.count + " 篇）";
    } else if (dayFocusCleared) {
      ui.dayFocusText.textContent = "日焦点不在当前筛选区间，已清除。";
    } else {
      ui.dayFocusText.textContent = isHeatmap ? "点击色块可查看当日详情。" : "";
    }

    if (state.payload?.error) {
      ui.totalValue.textContent = "0";
      ui.avgValue.textContent = "0";
      ui.peakValue.textContent = "-";
      ui.foot.textContent = "数据读取错误: " + state.payload.error;
      return;
    }

    if (!filtered.length) {
      ui.totalValue.textContent = "0";
      ui.avgValue.textContent = "0";
      ui.peakValue.textContent = "-";
      ui.foot.textContent =
        "当前筛选区间内没有数据。无效日期行: " +
        (state.payload?.debug?.invalidDateRows ?? 0) +
        "，类型过滤行: " +
        (state.payload?.debug?.filteredTypeRows ?? 0) +
        (fromApply ? " | 已应用: " + new Date().toLocaleTimeString() : "");
      return;
    }

    let s = this.summarize(filtered);
    ui.totalValue.textContent = String(s.total);
    ui.avgValue.textContent = s.avg.toFixed(1);
    let gran = state.heatGran || "day";
    let viewIsHeatmap = ui.viewSelect.value === "heatmap";
    let useMonthlyGran = viewIsHeatmap && gran === "month" && canUseMonthlyGran;
    if (s.peak) {
      if (useMonthlyGran) {
        ui.peakTitle.textContent = "峰值月份";
        ui.peakValue.textContent = s.peak.month + "\n(" + s.peak.count + ")";
      } else {
        ui.peakTitle.textContent = "峰值日期";
        let peakDayObj = state.allDaily.find(d => d.count === s.peak.count);
        ui.peakValue.textContent = peakDayObj
          ? peakDayObj.day + "\n(" + peakDayObj.count + ")"
          : s.peak.month + "\n(" + s.peak.count + ")";
      }
    } else {
      ui.peakTitle.textContent = "峰值日期";
      ui.peakValue.textContent = "-";
    }
    ui.foot.textContent =
      "提示：切换集合会自动统计该集合及其子集合。类型过滤行: " +
      (state.payload?.debug?.filteredTypeRows ?? 0) +
      (fromApply ? " | 已应用: " + new Date().toLocaleTimeString() : "");

    if (ui.viewSelect.value === "line") {
      this.drawLine(ui.chart, filtered);
    } else if (ui.viewSelect.value === "heatmap") {
      let gran = state.heatGran || "day";
      if (gran === "month") {
        this.drawHeatmapMonthly(ui.chart, filtered);
      } else {
        this.drawHeatmap(win, ui.chart, filteredDaily);
      }
    } else {
      this.drawBars(ui.chart, filtered);
    }
  },
};

function install() {}

function startup(addon, reason) {
  MonthlyStats.startup(addon, reason);
}

function shutdown(addon, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  MonthlyStats.shutdown(addon, reason);
}

function uninstall() {}

function onMainWindowLoad({ window }) {
  MonthlyStats.installInWindow(window);
}

function onMainWindowUnload({ window }) {
  MonthlyStats.removeFromWindow(window);
}
