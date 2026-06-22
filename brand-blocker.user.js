// ==UserScript==
// @name         电商屏蔽器
// @namespace    https://github.com/daidaidaiok/brand-blocker
// @version      2.4.0
// @description  在淘宝/天猫、京东、拼多多搜索结果中按品牌关键词或店铺名屏蔽商品。支持完全移除/半透明、导入导出 JSON 备份、localStorage 自动镜像防丢失。
// @author       daidaidaiok
// @match        *://*.taobao.com/*
// @match        *://*.tmall.com/*
// @match        *://*.jd.com/*
// @match        *://*.pinduoduo.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @license      MIT
// @homepageURL  https://github.com/daidaidaiok/brand-blocker
// @supportURL   https://github.com/daidaidaiok/brand-blocker/issues
// @downloadURL  https://raw.githubusercontent.com/daidaidaiok/brand-blocker/main/brand-blocker.user.js
// @updateURL    https://raw.githubusercontent.com/daidaidaiok/brand-blocker/main/brand-blocker.user.js
// ==/UserScript==

(function () {
  'use strict';

  var STORAGE_KEY = 'brand_blocker_keywords';
  var STORAGE_SHOPS = 'brand_blocker_shops';
  var STORAGE_SETTINGS = 'brand_blocker_settings';
  var BACKUP_LS_KEY = 'brand_blocker_backup';
  var ALL_KEYS = [STORAGE_KEY, STORAGE_SHOPS, STORAGE_SETTINGS];

  function readMirror() {
    try {
      var raw = window.localStorage.getItem(BACKUP_LS_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || !obj.data) return null;
      return obj;
    } catch (e) { return null; }
  }

  function writeMirror() {
    try {
      var data = {};
      for (var i = 0; i < ALL_KEYS.length; i++) {
        var k = ALL_KEYS[i];
        data[k] = GM_getValue(k, null);
      }
      var payload = { schema: 1, updatedAt: new Date().toISOString(), data: data };
      window.localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(payload));
    } catch (e) { /* 配额满或隐私模式忽略 */ }
  }

  function gmSetMirrored(key, value) {
    GM_setValue(key, value);
    writeMirror();
  }

  (function autoRestore() {
    var allEmpty = true;
    for (var i = 0; i < ALL_KEYS.length; i++) {
      var v = GM_getValue(ALL_KEYS[i], null);
      if (v !== null && v !== undefined && v !== '' && v !== '[]') { allEmpty = false; break; }
    }
    if (!allEmpty) return;
    var mirror = readMirror();
    if (!mirror || !mirror.data) return;
    var restored = 0;
    for (var k in mirror.data) {
      if (!Object.prototype.hasOwnProperty.call(mirror.data, k)) continue;
      if (ALL_KEYS.indexOf(k) < 0) continue;
      var mv = mirror.data[k];
      if (mv == null) continue;
      GM_setValue(k, mv);
      restored++;
    }
    if (restored > 0) {
      try { console.log('[brand-blocker] 已从 localStorage 自动恢复', mirror.updatedAt); } catch (e) {}
    }
  })();

  function getKeywords() {
    try { return JSON.parse(GM_getValue(STORAGE_KEY, '[]')); }
    catch (e) { return []; }
  }
  function saveKeywords(list) { gmSetMirrored(STORAGE_KEY, JSON.stringify(list)); }

  function getShops() {
    try { return JSON.parse(GM_getValue(STORAGE_SHOPS, '[]')); }
    catch (e) { return []; }
  }
  function saveShops(list) { gmSetMirrored(STORAGE_SHOPS, JSON.stringify(list)); }

  function getSettings() {
    try { return JSON.parse(GM_getValue(STORAGE_SETTINGS, '{"opacity":0.08,"hideMode":"remove","checkInterval":1500}')); }
    catch (e) { return { opacity: 0.08, hideMode: 'remove', checkInterval: 1500 }; }
  }
  function saveSettings(s) { gmSetMirrored(STORAGE_SETTINGS, JSON.stringify(s)); }

  var site = location.hostname;
  var platformName = null;
  if (site.indexOf('taobao.com') >= 0 || site.indexOf('tmall.com') >= 0) platformName = 'taobao';
  else if (site.indexOf('jd.com') >= 0) platformName = 'jd';
  else if (site.indexOf('pinduoduo.com') >= 0) platformName = 'pdd';
  if (!platformName) return;

  var hideStyle = document.createElement('style');
  hideStyle.id = 'brand-blocker-hide';
  hideStyle.textContent = '[data-bb-hidden="1"]{display:none!important}';
  document.head.appendChild(hideStyle);

  function findLayoutItem(element) {
    var el = element;
    while (el && el.parentElement && el.parentElement !== document.body) {
      var parent = el.parentElement;
      var ps = getComputedStyle(parent);
      var d = ps.display;
      if (d === 'grid' || d === 'inline-grid' || d === 'flex' || d === 'inline-flex') {
        return el;
      }
      el = parent;
    }
    return element;
  }

  function markTaobaoBlocked(card) {
    card.setAttribute('data-brand-blocked', 'done');
    card.setAttribute('data-bb-pending', '1');
  }

  function processTaobaoLayout() {
    var pending = document.querySelectorAll('[data-bb-pending="1"]');
    var itemMap = new Map();
    for (var i = 0; i < pending.length; i++) {
      var card = pending[i];
      card.removeAttribute('data-bb-pending');
      var layoutItem = findLayoutItem(card);
      if (!itemMap.has(layoutItem)) itemMap.set(layoutItem, []);
      itemMap.get(layoutItem).push(card);
    }
    itemMap.forEach(function (cards, layoutItem) {
      var allCards = layoutItem.querySelectorAll('[data-brand-blocked]');
      var totalProducts = layoutItem.querySelectorAll('div[class*="doubleCard"], .item.J_MouserOnverReq, .m-itemlist .items .item');
      if (totalProducts.length > 0 && allCards.length >= totalProducts.length) {
        layoutItem.setAttribute('data-bb-hidden', '1');
      } else {
        for (var j = 0; j < cards.length; j++) {
          cards[j].setAttribute('data-bb-hidden', '1');
        }
      }
    });
  }

  var blockedCount = 0;

  function findProducts() {
    if (platformName === 'taobao') {
      var cards = document.querySelectorAll('div[class*="doubleCard"]');
      if (cards.length > 0) return Array.prototype.slice.call(cards);
      cards = document.querySelectorAll('.item.J_MouserOnverReq, .m-itemlist .items .item');
      return Array.prototype.slice.call(cards);
    }
    if (platformName === 'jd') {
      var results = [];
      var seen = new Set();
      var titled = document.querySelectorAll('[title]');
      for (var i = 0; i < titled.length; i++) {
        var t = (titled[i].getAttribute('title') || '').trim();
        if (t.length < 15 || !/[一-鿿]/.test(t)) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        var card = titled[i].closest('a');
        if (!card) {
          card = titled[i];
          while (card && card !== document.body) {
            var cls = card.className || '';
            if (typeof cls === 'string' && cls.indexOf('_card_') >= 0) break;
            card = card.parentElement;
          }
          if (card && card !== document.body) {
            var parent = card.parentElement;
            if (parent && parent !== document.body) {
              var pcls = parent.className || '';
              if (typeof pcls === 'string' && pcls.indexOf('_wrapper_') >= 0) card = parent;
            }
          }
        }
        if (card && card !== document.body) results.push(card);
      }
      var unique = [];
      var seenEl = new Set();
      for (var j = 0; j < results.length; j++) {
        if (!seenEl.has(results[j])) { seenEl.add(results[j]); unique.push(results[j]); }
      }
      return unique;
    }
    return [];
  }

  function extractTitle(card) {
    if (platformName === 'jd') {
      var el = card;
      while (el && el !== document.body) {
        var t = el.getAttribute && el.getAttribute('title');
        if (t && t.trim().length > 10) return t.trim();
        el = el.parentElement;
      }
      var child = card.querySelector('[title]');
      if (child) {
        var ct = child.getAttribute('title');
        if (ct && ct.trim().length > 10) return ct.trim();
      }
      var img = card.querySelector('img[alt]');
      if (img && img.alt && img.alt.length > 4) return img.alt;
    }
    var spans = card.querySelectorAll('span');
    var best = '';
    for (var j = 0; j < spans.length; j++) {
      var txt = spans[j].textContent.trim();
      if (txt.length > 10 && txt.indexOf('¥') < 0 && txt.length > best.length) best = txt;
    }
    if (best.length > 10) return best;
    var titleEls = card.querySelectorAll('[class*="title"]');
    for (var k = 0; k < titleEls.length; k++) {
      var t3 = titleEls[k].textContent.trim();
      if (t3.length > 10) return t3;
    }
    return card.textContent || '';
  }

  function matchesKeyword(text, keywords) {
    if (!text) return null;
    var lower = text.toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (keywords[i] && lower.indexOf(keywords[i].toLowerCase()) >= 0) return keywords[i];
    }
    return null;
  }

  var SHOP_HINT_RE = /旗舰店|专营店|专卖店|官方店|自营|二手|严选|集合店|官方旗舰/;

  function cleanShopText(raw) {
    if (!raw) return '';
    var t = String(raw).replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 60) return '';
    if (/[¥￥]/.test(t)) return '';
    if (/^\d+(\.\d+)?$/.test(t)) return '';
    return t;
  }

  function extractShop(card) {
    var selectors;
    if (platformName === 'taobao') {
      selectors = [
        '[class*="shopNameText"]',
        '[class*="shopName"]',
        '[class*="ShopName"]',
        '[class*="shop-name"]',
        '[class*="shopname"]',
        '[class*="shopInfo"]',
        '[class*="seller"]',
        'a[href*="//shop"]',
        'a[href*=".taobao.com/shop"]',
        'a[href*=".tmall.com"][href*="shop"]'
      ];
    } else if (platformName === 'jd') {
      selectors = [
        '[class*="_shopName_"]',
        '[class*="shopName"]',
        '[class*="hd-shopname"]',
        '[class*="curr-shop"]',
        '[class*="_shop_"]',
        '[class*="_seller_"]',
        '[class*="_storeName_"]',
        '[class*="storeName"]',
        '[class*="shop_link"]',
        'a[href*="//mall.jd"]',
        'a[href*="//shop.jd"]',
        'a[href*="//paipai.jd"]',
        'a[href*="//pp.jd"]',
        'a[href*="paipai.com"]'
      ];
    } else {
      return '';
    }
    for (var i = 0; i < selectors.length; i++) {
      var el = card.querySelector(selectors[i]);
      if (!el) continue;
      var t = cleanShopText(el.getAttribute('title') || el.textContent || '');
      if (t) return t;
    }
    var anchors = card.querySelectorAll('a[title], a');
    for (var j = 0; j < anchors.length; j++) {
      var a = anchors[j];
      var ta = cleanShopText(a.getAttribute('title') || a.textContent || '');
      if (ta && SHOP_HINT_RE.test(ta)) return ta;
    }
    var leaves = card.querySelectorAll('span, div, em, b');
    for (var k = 0; k < leaves.length; k++) {
      var leaf = leaves[k];
      if (leaf.children.length) continue;
      var tl = cleanShopText(leaf.getAttribute('title') || leaf.textContent || '');
      if (tl && SHOP_HINT_RE.test(tl)) return tl;
    }
    return '';
  }

  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:999998;background:#1a1a2e;color:#e0e0e0;padding:8px 16px;border-radius:20px;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);cursor:pointer;user-select:none;border:1px solid rgba(255,255,255,.1)';
  document.body.appendChild(badge);

  var panel = null;

  function updateBadge() {
    var ruleCount = getKeywords().length + getShops().length;
    var total = blockedCount;
    if (ruleCount === 0) {
      badge.innerHTML = '🛡️ 电商屏蔽器 <span style="opacity:.5">（点击设置）</span>';
      badge.style.background = '#1a1a2e';
    } else if (total > 0) {
      badge.innerHTML = '🛡️ 已屏蔽 <b style="color:#ff6b6b">' + total + '</b> 件 · ' + ruleCount + ' 条规则';
      badge.style.background = '#2d1a1a';
    } else {
      badge.innerHTML = '🛡️ ' + ruleCount + ' 条规则生效中';
      badge.style.background = '#1a2e1a';
    }
  }

  function blockItems() {
    var keywords = getKeywords();
    var shops = getShops();
    var settings = getSettings();
    var products = findProducts();

    if (!keywords.length && !shops.length) {
      blockedCount = 0;
      updateBadge();
      return;
    }

    for (var i = 0; i < products.length; i++) {
      var card = products[i];
      if (!card.parentNode || card.getAttribute('data-brand-blocked') === 'done') continue;

      var title = extractTitle(card);
      var matched = matchesKeyword(title, keywords);
      if (!matched && shops.length) {
        var shopName = extractShop(card);
        if (shopName) matched = matchesKeyword(shopName, shops);
      }

      if (matched) {
        card.setAttribute('data-brand-blocked', 'done');
        if (platformName === 'taobao') {
          if (settings.hideMode === 'remove') {
            var layoutItem = findLayoutItem(card);
            if (layoutItem) layoutItem.remove();
          } else if (settings.hideMode === 'hide') {
            markTaobaoBlocked(card);
          } else {
            card.style.setProperty('opacity', String(settings.opacity), 'important');
            card.style.transition = 'opacity 0.3s ease';
          }
        } else {
          if (settings.hideMode === 'remove') {
            card.remove();
          } else if (settings.hideMode === 'hide') {
            card.style.setProperty('display', 'none', 'important');
          } else {
            card.style.setProperty('opacity', String(settings.opacity), 'important');
            card.style.transition = 'opacity 0.3s ease';
          }
        }
        blockedCount++;
      }
    }
    if (platformName === 'taobao' && settings.hideMode === 'hide') processTaobaoLayout();
    updateBadge();
  }

  var TAB_CONFIG = {
    brand: { get: getKeywords, save: saveKeywords, placeholder: '输入品牌关键词，如 苹果、xx 旗舰店', label: '品牌关键词', empty: '暂无品牌规则' },
    shop: { get: getShops, save: saveShops, placeholder: '输入店铺名，如 xx 官方旗舰店', label: '店铺', empty: '暂无店铺规则' }
  };

  function togglePanel() {
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:70px;left:20px;z-index:999999;background:#16162a;color:#e0e0e0;width:380px;border-radius:16px;font-family:-apple-system,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);overflow:hidden;border:1px solid rgba(255,255,255,.08)';

    var html = '<style>'
      + 'select,select option{color:#fff!important;background:#222!important}'
      + 'select{border:1px solid rgba(255,255,255,0.1)!important;padding:6px 10px!important;border-radius:8px!important}'
      + 'input[type=range]{accent-color:#6c5ce7!important}'
      + '.bb-tab{flex:1;background:transparent;border:0;color:#888;padding:12px 4px;cursor:pointer;font-size:13px;border-bottom:2px solid transparent;font-family:inherit}'
      + '.bb-tab[data-active="1"]{color:#fff;border-bottom-color:#6c5ce7;font-weight:600}'
      + '</style>';
    html += '<div style="padding:18px 20px 14px;background:linear-gradient(135deg,#1a1a3e,#2a1a3e);border-bottom:1px solid rgba(255,255,255,0.06)">'
      + '<h3 style="margin:0;font-size:16px;font-weight:600;color:#fff">🛡️ 电商屏蔽器</h3></div>';
    html += '<div style="display:flex;padding:0 20px;border-bottom:1px solid rgba(255,255,255,0.06)">'
      + '<button class="bb-tab" data-tab="brand" data-active="1">品牌关键词</button>'
      + '<button class="bb-tab" data-tab="shop">店铺</button>'
      + '</div>';
    html += '<div style="padding:16px 20px;max-height:420px;overflow-y:auto">';
    html += '<div style="display:flex;gap:8px;margin-bottom:16px">'
      + '<input type="text" id="bb-input" placeholder="" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:#fff">'
      + '<button id="bb-add" style="padding:10px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;cursor:pointer">添加</button>'
      + '</div>';
    html += '<ul id="bb-list" style="list-style:none;padding:0;margin:0"></ul>';
    html += '<div style="display:flex;gap:8px;padding:12px 0 4px;border-top:1px solid rgba(255,255,255,0.06);margin-top:12px">'
      + '<button id="bb-export" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:#e0e0e0;cursor:pointer">导出 JSON</button>'
      + '<button id="bb-import" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:#e0e0e0;cursor:pointer">导入 JSON</button>'
      + '</div>';
    html += '<div id="bb-io-wrap" style="display:none;padding:8px 0">'
      + '<textarea id="bb-io-text" style="width:100%;height:120px;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.3);color:#e0e0e0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px;box-sizing:border-box" placeholder="在此粘贴备份 JSON 后点「确认导入」"></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:6px">'
      + '<button id="bb-io-confirm" style="flex:1;padding:8px;border-radius:8px;border:none;background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;cursor:pointer">确认导入</button>'
      + '<button id="bb-io-cancel" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#bbb;cursor:pointer">取消</button>'
      + '</div>'
      + '<div id="bb-io-msg" style="min-height:18px;margin-top:6px;font-size:12px;color:#7bd389"></div>'
      + '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">'
      + '<label style="font-size:13px;color:#bbb">屏蔽模式</label>'
      + '<select id="bb-mode"><option value="remove">完全移除</option><option value="fade">半透明</option></select>'
      + '</div>';
    html += '<div id="bb-opacity-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">'
      + '<label style="font-size:13px;color:#bbb">透明度</label>'
      + '<input type="range" id="bb-opacity" min="0" max="0.5" step="0.05" style="width:140px">'
      + '</div>';
    html += '</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);

    var inp = panel.querySelector('#bb-input');
    var addBtn = panel.querySelector('#bb-add');
    var listEl = panel.querySelector('#bb-list');
    var modeEl = panel.querySelector('#bb-mode');
    var opacityEl = panel.querySelector('#bb-opacity');
    var opacityRowEl = panel.querySelector('#bb-opacity-row');
    var tabBtns = panel.querySelectorAll('.bb-tab');
    var currentTab = 'brand';

    function renderList() {
      var cfg = TAB_CONFIG[currentTab];
      var items = cfg.get();
      if (!items.length) {
        listEl.innerHTML = '<div style="text-align:center;color:#555;padding:8px">' + cfg.empty + '</div>';
        return;
      }
      var rows = items.map(function (_, i) {
        return '<li style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.04);margin-bottom:6px;border-radius:10px"><span></span><button data-idx="' + i + '" class="bb-rm" style="background:none;border:none;color:#ff6b6b;cursor:pointer">移除</button></li>';
      }).join('');
      listEl.innerHTML = rows;
      var spans = listEl.querySelectorAll('li > span');
      for (var si = 0; si < spans.length; si++) spans[si].textContent = items[si];
      listEl.querySelectorAll('.bb-rm').forEach(function (btn) {
        btn.onclick = function () {
          var c = TAB_CONFIG[currentTab];
          var k = c.get();
          k.splice(parseInt(this.dataset.idx, 10), 1);
          c.save(k);
          renderList();
          blockedCount = 0;
          location.reload();
        };
      });
    }

    function switchTab(name) {
      currentTab = name;
      tabBtns.forEach(function (b) {
        if (b.dataset.tab === name) b.setAttribute('data-active', '1');
        else b.removeAttribute('data-active');
      });
      inp.placeholder = TAB_CONFIG[name].placeholder;
      renderList();
    }

    tabBtns.forEach(function (b) {
      b.onclick = function () { switchTab(this.dataset.tab); };
    });

    addBtn.onclick = function () {
      var v = inp.value.trim();
      if (!v) return;
      var cfg = TAB_CONFIG[currentTab];
      var k = cfg.get();
      if (k.indexOf(v) >= 0) { inp.value = ''; return; }
      k.push(v);
      cfg.save(k);
      inp.value = '';
      renderList();
      blockItems();
    };
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addBtn.onclick();
    });

    var exportBtn = panel.querySelector('#bb-export');
    var importBtn = panel.querySelector('#bb-import');
    var ioWrap = panel.querySelector('#bb-io-wrap');
    var ioText = panel.querySelector('#bb-io-text');
    var ioConfirm = panel.querySelector('#bb-io-confirm');
    var ioCancel = panel.querySelector('#bb-io-cancel');
    var ioMsg = panel.querySelector('#bb-io-msg');

    function showIoMsg(text, ok) {
      ioMsg.textContent = text;
      ioMsg.style.color = ok ? '#7bd389' : '#ff6b6b';
    }

    function buildExportPayload() {
      return {
        schema: 1,
        exportedAt: new Date().toISOString(),
        scriptVersion: (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : 'unknown',
        data: {
          brand_blocker_keywords: GM_getValue(STORAGE_KEY, '[]'),
          brand_blocker_shops: GM_getValue(STORAGE_SHOPS, '[]'),
          brand_blocker_settings: GM_getValue(STORAGE_SETTINGS, '')
        }
      };
    }

    exportBtn.onclick = function () {
      var payload = buildExportPayload();
      var json = JSON.stringify(payload, null, 2);
      var copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json);
          copied = true;
        }
      } catch (e) {}
      try {
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'brand-blocker-backup-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) {}
      ioWrap.style.display = 'block';
      ioText.value = json;
      ioText.readOnly = true;
      showIoMsg(copied ? '已复制到剪贴板并触发文件下载' : '已触发文件下载（剪贴板不可用）', true);
    };

    importBtn.onclick = function () {
      ioWrap.style.display = 'block';
      ioText.value = '';
      ioText.readOnly = false;
      ioText.placeholder = '在此粘贴备份 JSON 后点「确认导入」';
      showIoMsg('', true);
      ioText.focus();
    };

    ioCancel.onclick = function () {
      ioWrap.style.display = 'none';
      ioText.value = '';
    };

    ioConfirm.onclick = function () {
      var text = ioText.value.trim();
      if (!text) { showIoMsg('请先粘贴 JSON', false); return; }
      var payload;
      try { payload = JSON.parse(text); }
      catch (e) { showIoMsg('JSON 解析失败: ' + e.message, false); return; }
      if (!payload || typeof payload !== 'object' || !payload.data) {
        showIoMsg('备份格式不正确，缺少 data 字段', false); return;
      }
      var whitelist = {};
      whitelist[STORAGE_KEY] = 1;
      whitelist[STORAGE_SHOPS] = 1;
      whitelist[STORAGE_SETTINGS] = 1;
      var n = 0;
      for (var ikey in payload.data) {
        if (!Object.prototype.hasOwnProperty.call(payload.data, ikey)) continue;
        if (!whitelist[ikey]) continue;
        var val = payload.data[ikey];
        if (val == null) continue;
        if (typeof val !== 'string') val = JSON.stringify(val);
        gmSetMirrored(ikey, val);
        n++;
      }
      showIoMsg('已恢复 ' + n + ' 个键，2 秒后刷新页面', true);
      setTimeout(function () { location.reload(); }, 2000);
    };

    var s0 = getSettings();
    modeEl.value = s0.hideMode === 'fade' ? 'fade' : 'remove';
    opacityEl.value = s0.opacity;
    opacityRowEl.style.display = (modeEl.value === 'fade') ? 'flex' : 'none';

    modeEl.onchange = function () {
      var s = getSettings();
      s.hideMode = modeEl.value;
      saveSettings(s);
      opacityRowEl.style.display = (s.hideMode === 'fade') ? 'flex' : 'none';
      location.reload();
    };

    opacityEl.oninput = function () {
      var s = getSettings();
      s.opacity = parseFloat(opacityEl.value);
      saveSettings(s);
      document.querySelectorAll('[data-brand-blocked="done"]').forEach(function (el) {
        if (s.hideMode === 'fade') el.style.setProperty('opacity', String(s.opacity), 'important');
      });
    };

    switchTab('brand');
  }

  badge.onclick = togglePanel;
  setInterval(blockItems, getSettings().checkInterval || 1500);
})();
