/* global APP_SHUTDOWN, ChromeUtils, Services, Zotero */

var MonthlyStats = {
  addon: null,
  services: null,
  menuItemId: "monthly-stats-menuitem",
  tabType: "monthly-stats",
  tabHookType: "monthly",
  l10nFile: "monthly-stats.ftl",
  htmlNS: "http://www.w3.org/1999/xhtml",
  windowListener: null,
  windowState: new WeakMap(),
  fallbackStrings: {
    "en-US": {
      "monthly-stats-menu-label": "Reference Additions Stats",
      "monthly-stats-tab-title": "Reference Additions Stats",
      "monthly-stats-alert-tabs-unavailable": "Reference Additions Stats needs Zotero's tab interface to show its dashboard.",
      "monthly-stats-title": "Reference Additions Stats",
      "monthly-stats-subtitle-default": "Track references by Zotero's Date Added field",
      "monthly-stats-view-heatmap": "Heatmap",
      "monthly-stats-view-bar": "Bar chart",
      "monthly-stats-button-refresh": "Refresh",
      "monthly-stats-button-clear-focus": "Clear selected date",
      "monthly-stats-granularity-day": "Daily",
      "monthly-stats-granularity-month": "Monthly",
      "monthly-stats-control-collection": "Collection",
      "monthly-stats-control-view": "View",
      "monthly-stats-control-range": "Range",
      "monthly-stats-control-granularity": "Granularity",
      "monthly-stats-summary-total": "Total references",
      "monthly-stats-summary-average": "Monthly average",
      "monthly-stats-summary-peak-day": "Peak date",
      "monthly-stats-summary-peak-month": "Peak month",
      "monthly-stats-range-6m": "Last 6 months",
      "monthly-stats-range-12m": "Last 12 months",
      "monthly-stats-range-36m": "Last 3 years",
      "monthly-stats-range-all": "All time",
      "monthly-stats-collection-all": "All collections",
      "monthly-stats-status-loading": "Reading Zotero library...",
      "monthly-stats-status-range-months": "Showing { $months } months",
      "monthly-stats-status-range-day-focus": "Showing { $months } months · Selected date: { $day } ({ $count } added)",
      "monthly-stats-status-range-day-cleared": "Showing { $months } months · Selected date cleared",
      "monthly-stats-status-applied": "{ $status } · Updated { $time }",
      "monthly-stats-status-error": "Could not read data: { $error }",
      "monthly-stats-status-empty": "No references found in the current filters.",
      "monthly-stats-tooltip-items": "{ $date }: { $count } added",
      "monthly-stats-weekday-sun": "Sun",
      "monthly-stats-weekday-mon": "Mon",
      "monthly-stats-weekday-tue": "Tue",
      "monthly-stats-weekday-wed": "Wed",
      "monthly-stats-weekday-thu": "Thu",
      "monthly-stats-weekday-fri": "Fri",
      "monthly-stats-weekday-sat": "Sat",
    },
    "zh-CN": {
      "monthly-stats-menu-label": "文献添加统计",
      "monthly-stats-tab-title": "文献添加统计",
      "monthly-stats-alert-tabs-unavailable": "文献添加统计需要 Zotero 的标签页界面才能显示独立看板。",
      "monthly-stats-title": "文献添加统计",
      "monthly-stats-subtitle-default": "按 Zotero 条目的添加日期汇总新增趋势",
      "monthly-stats-view-heatmap": "热力",
      "monthly-stats-view-bar": "柱状",
      "monthly-stats-button-refresh": "刷新",
      "monthly-stats-button-clear-focus": "清除焦点",
      "monthly-stats-granularity-day": "按天",
      "monthly-stats-granularity-month": "按月",
      "monthly-stats-control-collection": "集合",
      "monthly-stats-control-view": "视图",
      "monthly-stats-control-range": "范围",
      "monthly-stats-control-granularity": "粒度",
      "monthly-stats-summary-total": "文献总数",
      "monthly-stats-summary-average": "月均新增",
      "monthly-stats-summary-peak-day": "峰值日期",
      "monthly-stats-summary-peak-month": "峰值月份",
      "monthly-stats-range-6m": "近 6 个月",
      "monthly-stats-range-12m": "近一年",
      "monthly-stats-range-36m": "近三年",
      "monthly-stats-range-all": "全部",
      "monthly-stats-collection-all": "全部集合",
      "monthly-stats-status-loading": "正在读取 Zotero 数据...",
      "monthly-stats-status-range-months": "当前范围 { $months } 个月",
      "monthly-stats-status-range-day-focus": "当前范围 { $months } 个月 · 日焦点 { $day }（新增 { $count } 篇）",
      "monthly-stats-status-range-day-cleared": "当前范围 { $months } 个月 · 日焦点已清除",
      "monthly-stats-status-applied": "{ $status } · 已应用 { $time }",
      "monthly-stats-status-error": "读取失败: { $error }",
      "monthly-stats-status-empty": "当前筛选区间内没有可统计的条目。",
      "monthly-stats-tooltip-items": "{ $date }: { $count } 篇",
      "monthly-stats-weekday-sun": "周日",
      "monthly-stats-weekday-mon": "周一",
      "monthly-stats-weekday-tue": "周二",
      "monthly-stats-weekday-wed": "周三",
      "monthly-stats-weekday-thu": "周四",
      "monthly-stats-weekday-fri": "周五",
      "monthly-stats-weekday-sat": "周六",
    },
  },

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

  getAppLocale(win) {
    let locale = "";
    try {
      locale =
        this.services?.locale?.appLocaleAsBCP47 ||
        win?.Services?.locale?.appLocaleAsBCP47 ||
        "";
    } catch (e) {
      locale = "";
    }

    if (!locale) {
      try {
        locale = Zotero.Prefs.get("intl.locale.requested", true) || "";
      } catch (e) {
        locale = "";
      }
    }

    return String(locale || "").split(",")[0].trim();
  },

  getL10nLocale(win) {
    return /^zh(?:$|[-_])/i.test(this.getAppLocale(win)) ? "zh-CN" : "en-US";
  },

  shouldUseDocumentL10n(win) {
    let locale = this.getAppLocale(win).replace(/_/g, "-").toLowerCase();
    return !locale.startsWith("zh") || locale === "zh-cn";
  },

  interpolate(template, args) {
    if (!args) {
      return template;
    }

    return String(template).replace(/\{\s*\$(\w+)\s*\}/g, (match, key) => {
      return args[key] === undefined || args[key] === null ? "" : String(args[key]);
    });
  },

  t(win, id, args) {
    let locale = this.getL10nLocale(win);
    let strings = this.fallbackStrings[locale] || this.fallbackStrings["en-US"];
    let template = strings[id] || this.fallbackStrings["en-US"][id] || id;
    return this.interpolate(template, args);
  },

  installLocalization(win) {
    try {
      win?.MozXULElement?.insertFTLIfNeeded?.(this.l10nFile);
    } catch (e) {
      Zotero.debug("[monthly-stats] insert FTL failed: " + e);
    }
  },

  removeLocalization(win) {
    try {
      win?.document?.querySelector?.(`[href="${this.l10nFile}"]`)?.remove();
    } catch (e) {
      Zotero.debug("[monthly-stats] remove FTL failed: " + e);
    }
  },

  setL10nText(win, el, id, args) {
    if (!el) {
      return el;
    }

    el.textContent = this.t(win, id, args);
    if (!this.shouldUseDocumentL10n(win)) {
      el.removeAttribute("data-l10n-id");
      el.removeAttribute("data-l10n-args");
      return el;
    }

    try {
      let l10n = el.ownerDocument?.l10n;
      if (l10n?.setAttributes) {
        l10n.setAttributes(el, id, args || undefined);
      } else {
        el.setAttribute("data-l10n-id", id);
        if (args) {
          el.setAttribute("data-l10n-args", JSON.stringify(args));
        } else {
          el.removeAttribute("data-l10n-args");
        }
      }
    } catch (e) {
      Zotero.debug("[monthly-stats] set l10n text failed: " + e);
    }
    return el;
  },

  setL10nAttribute(win, el, id, attrName, args) {
    if (!el) {
      return el;
    }

    el.setAttribute(attrName, this.t(win, id, args));
    if (!this.shouldUseDocumentL10n(win)) {
      el.removeAttribute("data-l10n-id");
      el.removeAttribute("data-l10n-args");
      return el;
    }

    try {
      let l10n = el.ownerDocument?.l10n;
      if (l10n?.setAttributes) {
        l10n.setAttributes(el, id, args || undefined);
      } else {
        el.setAttribute("data-l10n-id", id);
        if (args) {
          el.setAttribute("data-l10n-args", JSON.stringify(args));
        } else {
          el.removeAttribute("data-l10n-args");
        }
      }
    } catch (e) {
      Zotero.debug("[monthly-stats] set l10n attribute failed: " + e);
    }
    return el;
  },

  async formatL10n(win, id, args) {
    this.installLocalization(win);
    if (!this.shouldUseDocumentL10n(win)) {
      return this.t(win, id, args);
    }

    try {
      if (win?.document?.l10n?.formatValue) {
        return await win.document.l10n.formatValue(id, args || undefined);
      }
    } catch (e) {
      Zotero.debug("[monthly-stats] format l10n failed: " + e);
    }
    return this.t(win, id, args);
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

  installInWindow(win) {
    if (this.windowState.get(win)) {
      return;
    }

    this.installLocalization(win);

    let state = {
      win,
      menuItem: null,
      tabID: null,
      tabData: null,
      tabHooksInstalled: false,
      previousTabHooks: null,
      statsPanel: null,
      selectedCollectionID: null,
      selectedDay: null,
      payload: null,
      allSeries: [],
      allDaily: [],
      ui: null,
      loadSeq: 0,
      heatGran: "day",
      viewMode: null,
      rangeInitialized: false,
    };

    this.windowState.set(win, state);
    this.installMenuItem(win);
    this.installTabHooks(win);
  },

  removeFromWindow(win) {
    let state = this.windowState.get(win);
    if (state) {
      if (state.tabID && win.document.getElementById(state.tabID)) {
        try {
          win.Zotero_Tabs?.close?.(state.tabID);
        } catch (e) {
          Zotero.debug("[monthly-stats] close stats tab failed: " + e);
          win.document.getElementById(state.tabID)?.remove();
        }
      }
      this.uninstallTabHooks(win);
    }

    let menuNode = win.document.getElementById(this.menuItemId);
    if (menuNode) {
      menuNode.remove();
    }

    this.removeLocalization(win);
    this.windowState.delete(win);
  },

  resetStatsState(state) {
    state.tabID = null;
    state.tabData = null;
    state.statsPanel = null;
    state.payload = null;
    state.allSeries = [];
    state.allDaily = [];
    state.ui = null;
    state.rangeInitialized = false;
    state.loadSeq += 1;
  },

  installTabHooks(win) {
    let state = this.windowState.get(win);
    let tabs = win.Zotero_Tabs;
    if (!state || state.tabHooksInstalled || !tabs?.tabHooks) {
      return;
    }

    let type = this.tabHookType;
    state.previousTabHooks = {};
    let ensureAction = (action) => {
      if (!tabs.tabHooks[action]) {
        tabs.tabHooks[action] = {};
      }
      state.previousTabHooks[action] = tabs.tabHooks[action][type];
    };

    ensureAction("focusFirst");
    ensureAction("refocus");
    ensureAction("undoClose");
    ensureAction("restoreState");

    tabs.tabHooks.focusFirst[type] = (tab) => this.focusStatsTab(win, tab?.id);
    tabs.tabHooks.refocus[type] = (tab) => this.focusStatsTab(win, tab?.id);
    tabs.tabHooks.undoClose[type] = async ({ data }, tabIndex) => {
      return this.openStatsTab(win, {
        index: Math.max(1, tabIndex || 1),
        select: false,
        initialState: data || {},
      });
    };
    tabs.tabHooks.restoreState[type] = async (tab, tabIndex) => {
      await this.openStatsTab(win, {
        index: Math.max(1, tabIndex || 1),
        select: !!tab.selected,
        initialState: tab.data || {},
      });
      return { itemID: null };
    };

    state.tabHooksInstalled = true;
  },

  uninstallTabHooks(win) {
    let state = this.windowState.get(win);
    let tabs = win.Zotero_Tabs;
    if (!state?.tabHooksInstalled || !tabs?.tabHooks || !state.previousTabHooks) {
      return;
    }

    for (let [action, previousHook] of Object.entries(state.previousTabHooks)) {
      if (!tabs.tabHooks[action]) {
        continue;
      }
      if (previousHook) {
        tabs.tabHooks[action][this.tabHookType] = previousHook;
      } else {
        delete tabs.tabHooks[action][this.tabHookType];
      }
    }

    state.tabHooksInstalled = false;
    state.previousTabHooks = null;
  },

  focusStatsTab(win, tabID) {
    let root = tabID ? win.document.getElementById(tabID) : null;
    root = root || this.windowState.get(win)?.statsPanel;
    let focusable = root?.querySelector?.("select, button, input, [tabindex]");
    if (focusable?.focus) {
      focusable.focus();
    }
  },

  async openStatsTab(win, options = {}) {
    let state = this.windowState.get(win);
    if (!state) {
      this.installInWindow(win);
      state = this.windowState.get(win);
    }
    if (!state) {
      return false;
    }

    this.installTabHooks(win);

    let tabs = win.Zotero_Tabs;
    if (!tabs?.add || !tabs?.select || !tabs?.deck) {
      Zotero.debug("[monthly-stats] Zotero_Tabs unavailable; cannot open independent dashboard");
      win.alert?.(await this.formatL10n(win, "monthly-stats-alert-tabs-unavailable"));
      return false;
    }

    if (state.tabID && win.document.getElementById(state.tabID)) {
      if (options.select !== false) {
        tabs.select(state.tabID);
      }
      await this.refreshStatsData(win, false);
      return true;
    }

    let initialState = options.initialState || {};
    state.selectedCollectionID =
      typeof initialState.selectedCollectionID === "number"
        ? initialState.selectedCollectionID
        : this.getSelectedCollectionID(win);
    state.selectedDay = initialState.selectedDay || null;
    state.heatGran = initialState.heatGran || "day";
    state.viewMode = initialState.viewMode || null;

    state.tabData = {
      pluginID: this.addon?.id || "monthly-stats@konstellation.local",
      selectedCollectionID: state.selectedCollectionID,
      selectedDay: state.selectedDay,
      heatGran: state.heatGran,
      viewMode: state.viewMode,
    };

    let tab = tabs.add({
      type: this.tabType,
      title: await this.formatL10n(win, "monthly-stats-tab-title"),
      index: options.index,
      select: options.select !== false,
      data: state.tabData,
      onClose: () => this.resetStatsState(state),
    });

    let container = tab.container;
    state.tabID = tab.id;
    container.setAttribute("style", "display:flex;flex:1;min-height:0;min-width:0;");
    container.onTabSelectionChanged = (selected) => {
      if (selected && state.ui && !state.payload) {
        this.refreshStatsData(win, false);
      }
    };

    state.statsPanel = this.makeEl(win.document, "div", "monthly-stats-shell");
    container.appendChild(state.statsPanel);

    this.buildStatsUI(win);
    await this.refreshStatsData(win, false);
    return true;
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
    this.setL10nAttribute(win, menuitem, "monthly-stats-menu-label", "label");
    menuitem.addEventListener("command", () => {
      if (!this.windowState.get(win)) {
        this.installInWindow(win);
      }
      this.openStatsTab(win);
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
      list.sort((a, b) =>
        String(a.collectionName).localeCompare(
          String(b.collectionName),
          this.getAppLocale() || "en-US"
        )
      );
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

  makeEl(doc, tag, className, textContent) {
    let el = doc.createElementNS(this.htmlNS, tag);
    if (className) {
      el.setAttribute("class", className);
    }
    if (textContent !== undefined) {
      el.textContent = textContent;
    }
    return el;
  },

  dashboardCSS() {
    return `
.monthly-stats-shell {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.monthly-stats-root {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  color: var(--fill-primary, rgba(0, 0, 0, .86));
  background: var(--material-background, #fff);
  font: 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
.monthly-stats-root * {
  box-sizing: border-box;
}
.monthly-stats-root [hidden] {
  display: none !important;
}
.ms-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--material-toolbar, var(--material-sidepane, #f7f7f7));
  border-bottom: var(--material-panedivider, 1px solid var(--color-panedivider, #dadada));
}
.ms-title-block {
  min-width: 148px;
  margin-inline-end: 8px;
}
.ms-title {
  margin: 0;
  color: var(--fill-primary, #1f1f1f);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
}
.ms-subtitle {
  margin-top: 2px;
  color: var(--fill-secondary, rgba(0, 0, 0, .55));
  font-size: 12px;
  line-height: 1.25;
}
.ms-toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  justify-content: flex-start;
}
.ms-control {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--fill-secondary, rgba(0, 0, 0, .55));
  font-size: 12px;
  white-space: nowrap;
}
.ms-control select,
.ms-control input {
  min-width: 108px;
  height: 26px;
  color: var(--fill-primary, #1f1f1f);
  background: var(--material-background, #fff);
  border: var(--material-border50, 1px solid rgba(0, 0, 0, .08));
  border-radius: 5px;
  padding: 2px 7px;
  font: inherit;
}
.ms-control:first-child select {
  min-width: 240px;
}
.ms-control input {
  min-width: 118px;
}
.ms-button,
.ms-segment-button {
  height: 26px;
  margin: 0;
  padding: 2px 10px;
  color: var(--fill-primary, #1f1f1f);
  background: var(--material-button, #fff);
  border: var(--material-border50, 1px solid rgba(0, 0, 0, .08));
  border-radius: 5px;
  font: inherit;
  line-height: 1.2;
  cursor: default;
}
.ms-button:hover,
.ms-segment-button:hover {
  background: var(--fill-senary, rgba(0, 0, 0, .03));
}
.ms-segment {
  display: inline-flex;
  align-items: center;
  padding: 1px;
  border-radius: 6px;
  background: var(--fill-quinary, rgba(0, 0, 0, .05));
}
.ms-segment-button {
  min-width: 48px;
  border-color: transparent;
  background: transparent;
  color: var(--fill-secondary, rgba(0, 0, 0, .55));
}
.ms-segment-button.active {
  color: var(--fill-primary, #1f1f1f);
  background: var(--material-background, #fff);
  border-color: var(--fill-quinary, rgba(0, 0, 0, .05));
  box-shadow: 0 1px 1px var(--fill-senary, rgba(0, 0, 0, .03));
}
.ms-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  background: var(--material-sidepane, #f2f2f2);
}
.ms-dashboard {
  display: block;
  width: 100%;
  max-width: none;
  margin: 0 auto;
}
.ms-primary,
.ms-chart-card,
.ms-summary-card {
  background: var(--material-background, #fff);
  border: var(--material-border50, 1px solid rgba(0, 0, 0, .08));
  border-radius: 6px;
}
.ms-primary {
  min-width: 0;
  padding: 12px;
}
.ms-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.ms-summary-card {
  min-height: 66px;
  padding: 10px 11px;
}
.ms-summary-title {
  color: var(--fill-secondary, rgba(0, 0, 0, .55));
  font-size: 11px;
  line-height: 1.2;
}
.ms-summary-value {
  margin-top: 5px;
  color: var(--fill-primary, #1f1f1f);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ms-summary-value.small {
  font-size: 13px;
  white-space: pre-line;
}
.ms-chart-card {
  min-height: 420px;
  padding: 8px;
}
.ms-chart {
  display: block;
  width: 100%;
  min-height: 300px;
  color: var(--fill-secondary, rgba(0, 0, 0, .55));
  background: var(--material-background, #fff);
}
.ms-focus-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.ms-muted {
  color: var(--fill-tertiary, rgba(0, 0, 0, .25));
}
@media (max-width: 900px) {
  .ms-summary {
    grid-template-columns: 1fr;
  }
}`;
  },

  buildStatsUI(win) {
    let state = this.windowState.get(win);
    if (!state || state.ui) {
      return;
    }

    this.installLocalization(win);

    let doc = win.document;
    state.statsPanel.replaceChildren();

    let style = this.makeEl(doc, "style");
    style.textContent = this.dashboardCSS();
    let wrap = this.makeEl(doc, "div", "monthly-stats-root");

    let toolbar = this.makeEl(doc, "div", "ms-toolbar");
    let titleBlock = this.makeEl(doc, "div", "ms-title-block");
    let title = this.setL10nText(win, this.makeEl(doc, "h1", "ms-title"), "monthly-stats-title");
    let subtitle = this.setL10nText(win, this.makeEl(doc, "div", "ms-subtitle"), "monthly-stats-subtitle-default");
    titleBlock.appendChild(title);
    titleBlock.appendChild(subtitle);

    let controls = this.makeEl(doc, "div", "ms-toolbar-controls");
    let collectionSelect = this.makeEl(doc, "select");
    let rangeSelect = this.makeEl(doc, "select");

    let viewSegment = this.makeEl(doc, "div", "ms-segment");
    let viewButtons = ["heatmap", "bar"].map((value) => {
      let id = value === "heatmap" ? "monthly-stats-view-heatmap" : "monthly-stats-view-bar";
      let button = this.setL10nText(win, this.makeEl(doc, "button", "ms-segment-button"), id);
      button.setAttribute("type", "button");
      button.dataset.view = value;
      viewSegment.appendChild(button);
      return button;
    });
    this.appendOptions(win, rangeSelect, this.rangeOptionsForView("heatmap", win));

    let refreshBtn = this.setL10nText(win, this.makeEl(doc, "button", "ms-button"), "monthly-stats-button-refresh");
    refreshBtn.setAttribute("type", "button");
    let clearDayBtn = this.setL10nText(win, this.makeEl(doc, "button", "ms-button"), "monthly-stats-button-clear-focus");
    clearDayBtn.setAttribute("type", "button");
    clearDayBtn.hidden = true;

    let granSegment = this.makeEl(doc, "div", "ms-segment");
    let dayGranBtn = this.setL10nText(win, this.makeEl(doc, "button", "ms-segment-button active"), "monthly-stats-granularity-day");
    let monthGranBtn = this.setL10nText(win, this.makeEl(doc, "button", "ms-segment-button"), "monthly-stats-granularity-month");
    dayGranBtn.setAttribute("type", "button");
    monthGranBtn.setAttribute("type", "button");
    granSegment.appendChild(dayGranBtn);
    granSegment.appendChild(monthGranBtn);
    granSegment.hidden = true;

    controls.appendChild(this.wrapLabeledControl(win, doc, "monthly-stats-control-collection", collectionSelect));
    controls.appendChild(this.wrapLabeledControl(win, doc, "monthly-stats-control-view", viewSegment));
    controls.appendChild(this.wrapLabeledControl(win, doc, "monthly-stats-control-range", rangeSelect));
    let granControl = this.wrapLabeledControl(win, doc, "monthly-stats-control-granularity", granSegment);
    granControl.hidden = true;
    controls.appendChild(granControl);
    controls.appendChild(clearDayBtn);
    controls.appendChild(refreshBtn);

    toolbar.appendChild(titleBlock);
    toolbar.appendChild(controls);

    let main = this.makeEl(doc, "div", "ms-main");
    let dashboard = this.makeEl(doc, "div", "ms-dashboard");
    let primary = this.makeEl(doc, "section", "ms-primary");
    let summary = this.makeEl(doc, "div", "ms-summary");

    let totalCard = this.createSummaryCard(win, doc, "monthly-stats-summary-total");
    let avgCard = this.createSummaryCard(win, doc, "monthly-stats-summary-average");
    let peakCard = this.createSummaryCard(win, doc, "monthly-stats-summary-peak-day", true);

    summary.appendChild(totalCard.card);
    summary.appendChild(avgCard.card);
    summary.appendChild(peakCard.card);

    let chartCard = this.makeEl(doc, "div", "ms-chart-card");
    let chart = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("class", "ms-chart");
    chart.setAttribute("viewBox", "0 0 960 340");
    chart.setAttribute("preserveAspectRatio", "xMinYMin meet");
    chartCard.appendChild(chart);

    primary.appendChild(summary);
    primary.appendChild(chartCard);

    dashboard.appendChild(primary);
    main.appendChild(dashboard);
    wrap.appendChild(toolbar);
    wrap.appendChild(main);

    state.statsPanel.appendChild(style);
    state.statsPanel.appendChild(wrap);

    state.ui = {
      wrap,
      subtitle,
      collectionSelect,
      viewButtons,
      rangeSelect,
      refreshBtn,
      clearDayBtn,
      granControl,
      granSegment,
      dayGranBtn,
      monthGranBtn,
      totalValue: totalCard.value,
      avgValue: avgCard.value,
      peakValue: peakCard.value,
      peakTitle: peakCard.title,
      chart,
    };

    for (let button of viewButtons) {
      button.addEventListener("click", () => {
        state.viewMode = button.dataset.view;
        this.syncRangeOptions(state, state.ui.rangeSelect.value);
        this.savePref("extensions.monthly-stats.defaultView", state.viewMode);
        this.updateTabData(state);
        this.renderStats(win);
      });
    }

    rangeSelect.addEventListener("change", () => {
      this.savePref("extensions.monthly-stats.defaultRange", rangeSelect.value);
      this.renderStats(win);
    });

    refreshBtn.addEventListener("click", () => this.refreshStatsData(win, true));
    refreshBtn.addEventListener("command", () => this.refreshStatsData(win, true));

    collectionSelect.addEventListener("change", () => {
      let raw = collectionSelect.value;
      state.selectedCollectionID = raw === "" ? "ALL" : parseInt(raw, 10);
      this.refreshStatsData(win, true);
    });

    clearDayBtn.addEventListener("click", () => {
      state.selectedDay = null;
      this.updateTabData(state);
      this.renderStats(win, true);
    });
    clearDayBtn.addEventListener("command", () => {
      state.selectedDay = null;
      this.updateTabData(state);
      this.renderStats(win, true);
    });

    dayGranBtn.addEventListener("click", () => this.setHeatGranularity(win, "day"));
    monthGranBtn.addEventListener("click", () => this.setHeatGranularity(win, "month"));
  },

  wrapLabeledControl(win, doc, labelID, control) {
    let wrap = this.makeEl(doc, "div", "ms-control");
    let text = this.setL10nText(win, this.makeEl(doc, "span"), labelID);
    wrap.appendChild(text);
    wrap.appendChild(control);
    return wrap;
  },

  createSummaryCard(win, doc, titleID, smallValue) {
    let card = this.makeEl(doc, "div", "ms-summary-card");
    let k = this.setL10nText(win, this.makeEl(doc, "div", "ms-summary-title"), titleID);
    let v = this.makeEl(doc, "div", smallValue ? "ms-summary-value small" : "ms-summary-value", "-");
    card.appendChild(k);
    card.appendChild(v);
    return { card, value: v, title: k };
  },

  appendOptions(win, selectEl, list) {
    for (let item of list) {
      let opt = selectEl.ownerDocument.createElementNS(this.htmlNS, "option");
      opt.value = item.value;
      this.setL10nText(win, opt, item.labelID);
      selectEl.appendChild(opt);
    }
  },

  rangeOptionsForView(viewMode, win) {
    if (viewMode === "bar") {
      return [
        { value: "12m", labelID: "monthly-stats-range-12m" },
        { value: "36m", labelID: "monthly-stats-range-36m" },
        { value: "all", labelID: "monthly-stats-range-all" },
      ];
    }

    return [
      { value: "6m", labelID: "monthly-stats-range-6m" },
      { value: "12m", labelID: "monthly-stats-range-12m" },
      { value: "36m", labelID: "monthly-stats-range-36m" },
      { value: "all", labelID: "monthly-stats-range-all" },
    ];
  },

  syncRangeOptions(state, preferredValue) {
    if (!state?.ui?.rangeSelect) {
      return "12m";
    }

    let select = state.ui.rangeSelect;
    let viewMode = state.viewMode === "bar" ? "bar" : "heatmap";
    let options = this.rangeOptionsForView(viewMode, state.win);
    let values = options.map((item) => item.value);
    let nextValue = values.includes(preferredValue) ? preferredValue : "12m";

    let currentValues = Array.from(select.options || []).map((opt) => opt.value);
    let needsRebuild =
      currentValues.length !== values.length ||
      currentValues.some((value, index) => value !== values[index]);
    if (needsRebuild) {
      select.replaceChildren();
      this.appendOptions(state.win, select, options);
    }

    select.value = nextValue;
    return nextValue;
  },

  savePref(name, value) {
    try {
      Zotero.Prefs.set(name, value, true);
    } catch (e) {
      Zotero.debug("[monthly-stats] save pref failed: " + e);
    }
  },

  updateTabData(state) {
    if (!state?.tabData) {
      return;
    }
    state.tabData.selectedCollectionID = state.selectedCollectionID;
    state.tabData.selectedDay = state.selectedDay;
    state.tabData.heatGran = state.heatGran;
    state.tabData.viewMode = state.viewMode;
  },

  setSegmentActive(buttons, activeValue, dataKey) {
    for (let button of buttons || []) {
      let isActive = button.dataset[dataKey] === activeValue;
      button.classList.toggle("active", isActive);
    }
  },

  canSelectHeatGranularity(viewMode, filteredMonths) {
    return viewMode === "heatmap" && Array.isArray(filteredMonths) && filteredMonths.length > 24;
  },

  syncGranularityControl(state, viewMode, filteredMonths) {
    let ui = state?.ui;
    if (!ui) {
      return false;
    }

    let canSelectGranularity = this.canSelectHeatGranularity(viewMode, filteredMonths);
    if (!canSelectGranularity && state.heatGran === "month") {
      state.heatGran = "day";
    }

    ui.granControl.hidden = !canSelectGranularity;
    ui.granSegment.hidden = !canSelectGranularity;
    ui.dayGranBtn.disabled = !canSelectGranularity;
    ui.monthGranBtn.disabled = !canSelectGranularity;
    ui.dayGranBtn.classList.toggle("active", state.heatGran === "day");
    ui.monthGranBtn.classList.toggle("active", state.heatGran === "month");

    return canSelectGranularity;
  },

  setHeatGranularity(win, value) {
    let state = this.windowState.get(win);
    if (!state?.ui) {
      return;
    }

    let viewMode = state.viewMode === "bar" ? "bar" : "heatmap";
    let filtered = this.filterByRange(state.allSeries, state.ui.rangeSelect.value);
    if (!this.canSelectHeatGranularity(viewMode, filtered)) {
      state.heatGran = "day";
      this.updateTabData(state);
      this.renderStats(win, false);
      return;
    }

    state.heatGran = value === "month" ? "month" : "day";
    this.updateTabData(state);
    this.renderStats(win, false);
  },

  populateCollectionSelect(state, collections, selectedID) {
    let select = state.ui.collectionSelect;
    select.replaceChildren();

    let doc = select.ownerDocument;
    let allOpt = doc.createElementNS(this.htmlNS, "option");
    allOpt.value = "";
    this.setL10nText(state.win, allOpt, "monthly-stats-collection-all");
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
    this.setL10nText(win, ui.subtitle, "monthly-stats-status-loading");

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

    if (!state.viewMode) {
      let okView = ["bar", "heatmap"].includes(payload.defaultView);
      state.viewMode = okView ? payload.defaultView : "heatmap";
    }
    this.setSegmentActive(ui.viewButtons, state.viewMode, "view");
    this.syncRangeOptions(
      state,
      state.rangeInitialized ? ui.rangeSelect.value : payload.defaultRange
    );
    state.rangeInitialized = true;

    this.updateTabData(state);
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

  filterByRange(series, rangeMode) {
    if (!series.length) {
      return [];
    }

    if (rangeMode === "all") {
      return series.slice();
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

  setScaledSvg(svg, width, height, minHeight, maxScale) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");

    let viewportWidth = Number(svg.clientWidth) || Number(svg.parentElement?.clientWidth) || 960;
    let widthScale = viewportWidth > 0 ? viewportWidth / width : 1;
    let scale = Math.max(1, Math.min(maxScale || 1, widthScale));
    svg.style.height = Math.max(minHeight || height, Math.ceil(height * scale)) + "px";
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
      line.setAttribute("stroke", "var(--fill-quinary, rgba(0, 0, 0, .05))");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      let value = Math.round(maxY - (maxY / ticks) * i);
      let label = svg.ownerDocument.createElementNS(ns, "text");
      label.setAttribute("x", 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
      label.setAttribute("font-size", "11");
      label.textContent = String(value);
      svg.appendChild(label);
    }

    let axis = svg.ownerDocument.createElementNS(ns, "line");
    axis.setAttribute("x1", left);
    axis.setAttribute("x2", left + width);
    axis.setAttribute("y1", top + height);
    axis.setAttribute("y2", top + height);
    axis.setAttribute("stroke", "var(--fill-tertiary, rgba(0, 0, 0, .25))");
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
      t.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
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
      rect.setAttribute("fill", "var(--accent-blue, #4072e5)");
      rect.setAttribute("opacity", "0.86");
      svg.appendChild(rect);
    }

    this.drawMonthLabels(svg, series, "bar");
  },

  heatColor(count) {
    if (!count || count <= 0) return "var(--fill-senary, rgba(0, 0, 0, .03))";
    if (count >= 30) return "#1b5e20";
    if (count >= 20) return "#2e7d32";
    if (count >= 12) return "#66a96b";
    if (count >= 6) return "#a5d6a7";
    return "#dff2df";
  },

  heatColorMonthly(count) {
    if (!count || count <= 0) return "var(--fill-senary, rgba(0, 0, 0, .03))";
    if (count >= 300) return "#1b5e20";
    if (count >= 200) return "#2e7d32";
    if (count >= 120) return "#66a96b";
    if (count >= 60) return "#a5d6a7";
    return "#dff2df";
  },

  itemTooltip(win, date, count) {
    return this.t(win, "monthly-stats-tooltip-items", { date, count });
  },

  weekdayLabels(win) {
    return [
      this.t(win, "monthly-stats-weekday-sun"),
      this.t(win, "monthly-stats-weekday-mon"),
      this.t(win, "monthly-stats-weekday-tue"),
      this.t(win, "monthly-stats-weekday-wed"),
      this.t(win, "monthly-stats-weekday-thu"),
      this.t(win, "monthly-stats-weekday-fri"),
      this.t(win, "monthly-stats-weekday-sat"),
    ];
  },

  setStatusText(win, el, id, args, fromApply) {
    if (!fromApply) {
      this.setL10nText(win, el, id, args);
      return;
    }

    let status = this.t(win, id, args);
    this.setL10nText(win, el, "monthly-stats-status-applied", {
      status,
      time: new Date().toLocaleTimeString(),
    });
  },

  drawHeatmap(win, svg, dailySeries) {
    if (!dailySeries.length) {
      return;
    }

    let ns = "http://www.w3.org/2000/svg";
    let byMonth = new Map();
    for (let d of dailySeries) {
      let month = d.day.slice(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, []);
      }
      byMonth.get(month).push(d);
    }

    let months = Array.from(byMonth.keys()).sort();
    let monthCount = months.length;
    let left = 86;
    let top = 28;
    let cell = monthCount <= 12 ? 16 : monthCount <= 36 ? 14 : 12;
    let gap = monthCount <= 12 ? 4 : 3;
    let labelGap = monthCount <= 12 ? 24 : monthCount <= 36 ? 20 : 18;
    let width = left + 31 * (cell + gap) + 24;
    let height = top + months.length * (cell + gap + labelGap) + 54;
    let minHeight = monthCount <= 12 ? 520 : monthCount <= 36 ? 720 : 480;
    let maxScale = monthCount <= 12 ? 1.45 : monthCount <= 36 ? 1.25 : 1.15;

    this.setScaledSvg(svg, width, height, minHeight, maxScale);
    let state = this.windowState.get(win);
    let selectedDay = state?.selectedDay || null;

    for (let i = 0; i < months.length; i++) {
      let month = months[i];
      let rowY = top + i * (cell + gap + labelGap);

      let monthText = svg.ownerDocument.createElementNS(ns, "text");
      monthText.setAttribute("x", 12);
      monthText.setAttribute("y", rowY + cell - 1);
      monthText.setAttribute("text-anchor", "start");
      monthText.setAttribute("font-size", "10");
      monthText.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
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
          rect.setAttribute("stroke", "var(--fill-primary, rgba(0, 0, 0, .86))");
          rect.setAttribute("stroke-width", "1.3");
        } else {
          rect.setAttribute("stroke", "transparent");
          rect.setAttribute("stroke-width", "0");
        }
        let title = svg.ownerDocument.createElementNS(ns, "title");
        title.textContent = this.itemTooltip(win, p.day, p.count);
        rect.appendChild(title);
        rect.addEventListener("click", () => {
          let curState = this.windowState.get(win);
          if (!curState) {
            return;
          }
          curState.selectedDay = curState.selectedDay === p.day ? null : p.day;
          this.updateTabData(curState);
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
      t.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
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
      text.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
      text.textContent = item.label;
      svg.appendChild(text);
      lx += legendWidths[i] + legendGap;
    }
  },

  drawHeatmapGithub(win, svg, dailySeries) {
    if (!dailySeries.length) {
      return;
    }

    let ns = "http://www.w3.org/2000/svg";
    let cell = 11;
    let gap = 3;
    let left = 52;
    let top = 22;
    let right = 22;
    let bottom = 32;
    let dayMs = 24 * 60 * 60 * 1000;

    let first = new Date(dailySeries[0].day + "T00:00:00Z");
    let last = new Date(dailySeries[dailySeries.length - 1].day + "T00:00:00Z");
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
      return;
    }

    let gridStart = new Date(first.getTime());
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    let gridEnd = new Date(last.getTime());
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));
    let weeks = Math.max(1, Math.floor((gridEnd - gridStart) / dayMs / 7) + 1);
    let gridWidth = weeks * cell + (weeks - 1) * gap;
    let gridHeight = 7 * cell + 6 * gap;
    let width = left + gridWidth + right;
    let height = top + gridHeight + bottom;
    let counts = new Map(dailySeries.map((item) => [item.day, item.count]));

    this.setScaledSvg(svg, width, height, 190, 1.35);

    let state = this.windowState.get(win);
    let selectedDay = state?.selectedDay || null;
    let weekdays = this.weekdayLabels(win);
    for (let row = 0; row < weekdays.length; row++) {
      let label = svg.ownerDocument.createElementNS(ns, "text");
      label.setAttribute("x", 8);
      label.setAttribute("y", top + row * (cell + gap) + cell / 2 + 3);
      label.setAttribute("text-anchor", "start");
      label.setAttribute("font-size", "9");
      label.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
      label.textContent = weekdays[row];
      svg.appendChild(label);
    }

    let monthLabels = new Map();
    for (let t = new Date(gridStart.getTime()); t <= gridEnd; t.setUTCDate(t.getUTCDate() + 1)) {
      let day = this.formatDayKey(t);
      let dayIndex = Math.round((t - gridStart) / dayMs);
      let col = Math.floor(dayIndex / 7);
      let row = t.getUTCDay();
      let x = left + col * (cell + gap);
      let y = top + row * (cell + gap);
      let inRange = t >= first && t <= last;
      let count = inRange ? counts.get(day) || 0 : 0;

      let rect = svg.ownerDocument.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", cell);
      rect.setAttribute("height", cell);
      rect.setAttribute("rx", "1.5");
      rect.setAttribute("fill", inRange ? this.heatColor(count) : "transparent");
      rect.setAttribute("opacity", inRange ? "0.96" : "1");
      if (inRange) {
        rect.setAttribute("cursor", "pointer");
        if (selectedDay === day) {
          rect.setAttribute("stroke", "var(--fill-primary, rgba(0, 0, 0, .86))");
          rect.setAttribute("stroke-width", "1.3");
        } else {
          rect.setAttribute("stroke", "transparent");
          rect.setAttribute("stroke-width", "0");
        }
        let title = svg.ownerDocument.createElementNS(ns, "title");
        title.textContent = this.itemTooltip(win, day, count);
        rect.appendChild(title);
        rect.addEventListener("click", () => {
          let curState = this.windowState.get(win);
          if (!curState) {
            return;
          }
          curState.selectedDay = curState.selectedDay === day ? null : day;
          this.updateTabData(curState);
          this.renderStats(win, true);
        });
      }
      svg.appendChild(rect);

      let monthKey = this.formatMonthKey(t);
      if (inRange && !monthLabels.has(monthKey)) {
        monthLabels.set(monthKey, x);
      }
    }

    let monthY = height - 10;
    for (let [month, x] of monthLabels) {
      let text = svg.ownerDocument.createElementNS(ns, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", monthY);
      text.setAttribute("text-anchor", "start");
      text.setAttribute("font-size", "9");
      text.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
      text.textContent = month;
      svg.appendChild(text);
    }
  },

  drawHeatmapMonthly(win, svg, series) {
    if (!series.length) {
      return;
    }

    let ns = "http://www.w3.org/2000/svg";
    let cell = 18;
    let gap = 4;
    let top = 28;
    let left = 60;

    let gridWidth = 12 * cell + 11 * gap;
    let width = left + gridWidth + 30;
    let height = top + Math.ceil(series.length / 12) * (cell + gap + 16) + 34;

    this.setScaledSvg(svg, width, height, 280, 1.6);

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
      yearLabel.setAttribute("x", 12);
      yearLabel.setAttribute("y", curY + cell / 2 + 4);
      yearLabel.setAttribute("text-anchor", "start");
      yearLabel.setAttribute("font-size", "10");
      yearLabel.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
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
        title.textContent = this.itemTooltip(win, p.month, p.count);
        rect.appendChild(title);
        svg.appendChild(rect);

        if (curY === top) {
          let monLabel = svg.ownerDocument.createElementNS(ns, "text");
          monLabel.setAttribute("x", x + cell / 2);
          monLabel.setAttribute("y", top - 4);
          monLabel.setAttribute("text-anchor", "middle");
          monLabel.setAttribute("font-size", "8");
          monLabel.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
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
    this.setScaledSvg(svg, width, height, 280, 1.6);
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
      text.setAttribute("fill", "var(--fill-secondary, rgba(0, 0, 0, .55))");
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
    if (state.viewMode !== "bar" && state.viewMode !== "heatmap") {
      state.viewMode = "heatmap";
    }
    let viewMode = state.viewMode || "heatmap";
    this.syncRangeOptions(state, ui.rangeSelect.value);
    let filtered = this.filterByRange(state.allSeries, ui.rangeSelect.value);
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

    if (state.selectedDay && selectedDayData) {
      this.setStatusText(
        win,
        ui.subtitle,
        "monthly-stats-status-range-day-focus",
        {
          months: filtered.length,
          day: selectedDayData.day,
          count: selectedDayData.count,
        },
        fromApply
      );
    } else if (dayFocusCleared) {
      this.setStatusText(
        win,
        ui.subtitle,
        "monthly-stats-status-range-day-cleared",
        { months: filtered.length },
        fromApply
      );
    } else {
      this.setStatusText(
        win,
        ui.subtitle,
        "monthly-stats-status-range-months",
        { months: filtered.length },
        fromApply
      );
    }

    this.clearSvg(ui.chart);
    ui.chart.setAttribute("viewBox", "0 0 960 340");
    ui.chart.setAttribute("preserveAspectRatio", "xMinYMin meet");
    ui.chart.style.height = "300px";

    this.setSegmentActive(ui.viewButtons, viewMode, "view");
    let canUseMonthlyGran = this.syncGranularityControl(state, viewMode, filtered);
    ui.clearDayBtn.hidden = !state.selectedDay;

    if (state.payload?.error) {
      ui.totalValue.textContent = "0";
      ui.avgValue.textContent = "0";
      ui.peakValue.textContent = "-";
      this.setL10nText(win, ui.subtitle, "monthly-stats-status-error", {
        error: state.payload.error,
      });
      return;
    }

    if (!filtered.length) {
      ui.totalValue.textContent = "0";
      ui.avgValue.textContent = "0";
      ui.peakValue.textContent = "-";
      this.setL10nText(win, ui.subtitle, "monthly-stats-status-empty");
      return;
    }

    let s = this.summarize(filtered);
    ui.totalValue.textContent = String(s.total);
    ui.avgValue.textContent = s.avg.toFixed(1);
    let gran = state.heatGran || "day";
    let viewIsHeatmap = viewMode === "heatmap";
    let useMonthlyGran = viewIsHeatmap && gran === "month" && canUseMonthlyGran;
    if (s.peak) {
      if (useMonthlyGran) {
        this.setL10nText(win, ui.peakTitle, "monthly-stats-summary-peak-month");
        ui.peakValue.textContent = s.peak.month + "\n(" + s.peak.count + ")";
      } else {
        this.setL10nText(win, ui.peakTitle, "monthly-stats-summary-peak-day");
        let peakDayObj = state.allDaily.find(d => d.count === s.peak.count);
        ui.peakValue.textContent = peakDayObj
          ? peakDayObj.day + "\n(" + peakDayObj.count + ")"
          : s.peak.month + "\n(" + s.peak.count + ")";
      }
    } else {
      this.setL10nText(win, ui.peakTitle, "monthly-stats-summary-peak-day");
      ui.peakValue.textContent = "-";
    }

    this.updateTabData(state);

    if (viewMode === "heatmap") {
      let gran = state.heatGran || "day";
      if (gran === "month") {
        this.drawHeatmapMonthly(win, ui.chart, filtered);
      } else if (ui.rangeSelect.value === "6m") {
        this.drawHeatmapGithub(win, ui.chart, filteredDaily);
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
