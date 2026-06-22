// ==UserScript==
// @name         电商品牌屏蔽器
// @namespace    https://github.com/daidaidaiok/brand-blocker
// @version      2.2.9
// @description  在淘宝/天猫、京东、拼多多搜索结果中按关键词屏蔽品牌商品。支持完全移除/半透明两种模式，修复京东半透明叠加与淘宝留白问题。
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
  var STORAGE_SETTINGS = 'brand_blocker_settings';

  function getKeywords() {
    try { return JSON.parse(GM_getValue(STORAGE_KEY, '[]')); }
    catch (e) { return []; }
  }
  function saveKeywords(list) { GM_setValue(STORAGE_KEY, JSON.stringify(list)); }

  function getSettings() {
    try { return JSON.parse(GM_getValue(STORAGE_SETTINGS, '{"opacity":0.08,"hideMode":"remove","checkInterval":1500}')); }
    catch (e) { return { opacity: 0.08, hideMode: 'remove', checkInterval: 1500 }; }
  }
  function saveSettings(s) { GM_setValue(STORAGE_SETTINGS, JSON.stringify(s)); }

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

  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:999998;background:#1a1a2e;color:#e0e0e0;padding:8px 16px;border-radius:20px;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);cursor:pointer;user-select:none;border:1px solid rgba(255,255,255,.1)';
  document.body.appendChild(badge);

  var panel = null;

  function updateBadge() {
    var keywords = getKeywords();
    var total = blockedCount;
    if (keywords.length === 0) {
      badge.innerHTML = '🛡️ 品牌屏蔽器 <span style="opacity:.5">（点击设置）</span>';
      badge.style.background = '#1a1a2e';
    } else if (total > 0) {
      badge.innerHTML = '🛡️ 已屏蔽 <b style="color:#ff6b6b">' + total + '</b> 件 · ' + keywords.length + ' 条规则';
      badge.style.background = '#2d1a1a';
    } else {
      badge.innerHTML = '🛡️ ' + keywords.length + ' 条规则生效中';
      badge.style.background = '#1a2e1a';
    }
  }

  function blockItems() {
    var keywords = getKeywords();
    var settings = getSettings();
    var products = findProducts();

    if (!keywords.length) {
      blockedCount = 0;
      updateBadge();
      return;
    }

    for (var i = 0; i < products.length; i++) {
      var card = products[i];
      if (!card.parentNode || card.getAttribute('data-brand-blocked') === 'done') continue;

      var title = extractTitle(card);
      var matched = matchesKeyword(title, keywords);

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

  function togglePanel() {
    if (!panel) {
      panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;bottom:70px;left:20px;z-index:999999;background:#16162a;color:#e0e0e0;width:380px;border-radius:16px;font-family:-apple-system,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);overflow:hidden;border:1px solid rgba(255,255,255,.08)';

      var html = '<style>select,select option{color:#fff!important;background:#222!important}select{border:1px solid rgba(255,255,255,0.1)!important;padding:6px 10px!important;border-radius:8px!important}input[type=range]{accent-color:#6c5ce7!important}</style>';
      html += '<div style="padding:18px 20px 14px;background:linear-gradient(135deg,#1a1a3e,#2a1a3e);border-bottom:1px solid rgba(255,255,255,0.06)">';
      html += '<h3 style="margin:0;font-size:16px;font-weight:600;color:#fff">🛡️ 电商品牌屏蔽器</h3></div>';
      html += '<div style="padding:16px 20px;max-height:420px;overflow-y:auto">';
      html += '<div style="display:flex;gap:8px;margin-bottom:16px"><input type="text" id="bb-input" placeholder="输入品牌名..." style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:#fff"><button id="bb-add" style="padding:10px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;cursor:pointer">添加</button></div>';
      html += '<ul id="bb-list" style="list-style:none;padding:0;margin:0"></ul>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 0 8px"><label style="font-size:13px;color:#bbb">屏蔽模式</label><select id="bb-mode"><option value="remove">完全移除</option><option value="fade">半透明</option></select></div>';
      html += '<div id="bb-opacity-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0"><label style="font-size:13px;color:#bbb">透明度</label><input type="range" id="bb-opacity" min="0" max="0.5" step="0.05" style="width:140px"></div>';
      html += '</div>';

      panel.innerHTML = html;
      document.body.appendChild(panel);

      var inp = document.getElementById('bb-input');
      var addBtn = document.getElementById('bb-add');
      var listEl = document.getElementById('bb-list');
      var modeEl = document.getElementById('bb-mode');
      var opacityEl = document.getElementById('bb-opacity');
      var opacityRowEl = document.getElementById('bb-opacity-row');

      function renderList() {
        var kws = getKeywords();
        listEl.innerHTML = kws.length
          ? kws.map(function (k, i) {
              return '<li style="display:flex;justify-content:space-between;padding:10px;background:rgba(255,255,255,0.04);margin-bottom:6px;border-radius:10px"><span></span><button data-idx="' + i + '" class="bb-rm" style="background:none;border:none;color:#ff6b6b;cursor:pointer">移除</button></li>';
            }).join('')
          : '<div style="text-align:center;color:#555">列表为空</div>';
        var spans = listEl.querySelectorAll('li > span');
        for (var si = 0; si < spans.length; si++) spans[si].textContent = kws[si];
        listEl.querySelectorAll('.bb-rm').forEach(function (btn) {
          btn.onclick = function () {
            var k = getKeywords();
            k.splice(parseInt(this.dataset.idx, 10), 1);
            saveKeywords(k);
            renderList();
            blockedCount = 0;
            location.reload();
          };
        });
      }

      addBtn.onclick = function () {
        var v = inp.value.trim();
        if (v) {
          var k = getKeywords();
          k.push(v);
          saveKeywords(k);
          inp.value = '';
          renderList();
          blockItems();
        }
      };
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addBtn.onclick();
      });

      modeEl.value = getSettings().hideMode;
      opacityEl.value = getSettings().opacity;
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
      renderList();
    } else {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  badge.onclick = togglePanel;
  setInterval(blockItems, getSettings().checkInterval || 1500);
})();
