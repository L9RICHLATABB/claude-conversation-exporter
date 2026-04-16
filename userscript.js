// ==UserScript==
// @name         Claude Export
// @namespace    https://github.com/yourusername/claude-export
// @version      1.1.0
// @description  Export any Claude conversation to Markdown or JSON in one click
// @author       you
// @match        https://claude.ai/chat/*
// @match        https://claude.ai/project/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function waitForUI(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { observer.disconnect(); resolve(found); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); reject(new Error('UI timeout')); }, timeout);
    });
  }

  function getOrgId() {
    return document.cookie.match(/lastActiveOrg=([^;]+)/)?.[1] ?? null;
  }

  function getConversationId() {
    return window.location.pathname.split('/').pop() || null;
  }

  function slugify(str) {
    return (str || 'claude_conversation')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .substring(0, 100);
  }

  function formatTimestamp(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function extractText(content = []) {
    return content.map(block => {
      if (block.type === 'text') return block.text ?? '';
      if (block.type === 'tool_use') return `\`[Tool: ${block.name}]\``;
      if (block.type === 'tool_result') return '`[Tool result]`';
      if (block.type === 'image') return '`[Image]`';
      if (block.type === 'document') return '`[Document]`';
      return '';
    }).join('').trim();
  }

  // ─── API ───────────────────────────────────────────────────────────────────

  async function fetchConversation() {
    const orgId = getOrgId();
    const convId = getConversationId();
    if (!orgId || !convId) throw new Error('Cannot find org/conversation ID.');
    const url = `/api/organizations/${orgId}/chat_conversations/${convId}` +
      `?tree=true&rendering_mode=messages&render_all_tools=true`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  // ─── Formatters ────────────────────────────────────────────────────────────

  function toMarkdown(data, opts = {}) {
    const messages = data.chat_messages ?? [];
    const title = data.name || 'Conversation with Claude';
    let md = `# ${title}\n`;
    md += `*Exported ${new Date().toLocaleDateString()}`;
    if (data.created_at) md += ` · Started ${formatTimestamp(data.created_at)}`;
    md += `*\n\n---\n\n`;

    for (const msg of messages) {
      const text = extractText(msg.content);
      if (!text) continue;
      const ts = opts.timestamps !== false && msg.created_at
        ? ` *(${formatTimestamp(msg.created_at)})*` : '';
      const role = msg.sender === 'human' ? `## 🧑 You${ts}` : `## 🤖 Claude${ts}`;
      md += `${role}\n\n${text}\n\n---\n\n`;
    }
    return md;
  }

  function toJSON(data) {
    const messages = (data.chat_messages ?? []).map(msg => ({
      role: msg.sender === 'human' ? 'human' : 'assistant',
      text: extractText(msg.content),
      timestamp: msg.created_at ?? null,
      uuid: msg.uuid ?? null,
    })).filter(m => m.text);

    return JSON.stringify({
      title: data.name || 'Conversation with Claude',
      conversation_id: data.uuid,
      created_at: data.created_at,
      exported_at: new Date().toISOString(),
      message_count: messages.length,
      messages,
    }, null, 2);
  }

  // ─── Download ──────────────────────────────────────────────────────────────

  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: filename,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ─── Export runner ─────────────────────────────────────────────────────────

  async function runExport(format, opts) {
    setButtonState('loading');
    try {
      const data = await fetchConversation();
      const slug = slugify(data.name);
      let content, filename, mimeType;

      if (format === 'json') {
        content = toJSON(data);
        filename = `${slug}.json`;
        mimeType = 'application/json';
      } else {
        content = toMarkdown(data, opts);
        filename = `${slug}.md`;
        mimeType = 'text/markdown';
      }

      triggerDownload(content, filename, mimeType);
      setButtonState('success');
      setTimeout(() => setButtonState('idle'), 2500);
    } catch (err) {
      console.error('[claude-export]', err);
      setButtonState('error', err.message);
      setTimeout(() => setButtonState('idle'), 4000);
    }
  }

  // ─── Button UI ─────────────────────────────────────────────────────────────

  let exportBtn = null;
  let dropdownOpen = false;

  const MENU_ITEMS = [
    { label: '📄 Markdown',                  format: 'markdown', opts: {} },
    { label: '📄 Markdown (no timestamps)',  format: 'markdown', opts: { timestamps: false } },
    { label: '🗂  JSON',                     format: 'json',     opts: {} },
  ];

  function setButtonState(state, errMsg = '') {
    if (!exportBtn) return;
    const label = exportBtn.querySelector('.ce-label');
    const map = {
      idle:    ['⬇ Export',      '#2a2a2a'],
      loading: ['⏳ Exporting…', '#3a3a3a'],
      success: ['✅ Saved!',     '#1a3a2a'],
      error:   [`❌ ${errMsg}`,  '#3a1a1a'],
    };
    const [text, bg] = map[state] ?? map.idle;
    label.textContent = text;
    exportBtn.style.background = bg;
  }

  function buildDropdown() {
    const menu = document.createElement('div');
    menu.className = 'ce-dropdown';
    menu.style.cssText = `
      position: absolute; top: calc(100% + 8px); right: 0;
      background: #1e1e1e; border: 1px solid #444; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6); overflow: hidden;
      z-index: 99999; min-width: 210px;
      font-family: 'DM Sans', system-ui, sans-serif;
    `;

    for (const item of MENU_ITEMS) {
      const row = document.createElement('button');
      row.textContent = item.label;
      row.style.cssText = `
        display: block; width: 100%; padding: 10px 16px;
        background: none; border: none; border-bottom: 1px solid #2a2a2a;
        color: #ccc; font-size: 13px; text-align: left; cursor: pointer;
        transition: background 0.15s;
      `;
      row.onmouseenter = () => { row.style.background = '#2d2d2d'; row.style.color = '#fff'; };
      row.onmouseleave = () => { row.style.background = 'none'; row.style.color = '#ccc'; };
      row.onclick = e => {
        e.stopPropagation();
        closeDropdown();
        runExport(item.format, item.opts);
      };
      menu.appendChild(row);
    }

    // Remove bottom border on last item
    menu.lastChild.style.borderBottom = 'none';
    return menu;
  }

  function openDropdown() {
    if (dropdownOpen) return;
    dropdownOpen = true;
    exportBtn.appendChild(buildDropdown());
  }

  function closeDropdown() {
    if (!dropdownOpen) return;
    dropdownOpen = false;
    exportBtn.querySelector('.ce-dropdown')?.remove();
  }

  function buildButton() {
    const btn = document.createElement('div');
    btn.id = '__claude_export_btn__';
    btn.style.cssText = `
      position: relative; display: inline-flex;
      align-items: center; gap: 5px;
      background: #2a2a2a; color: #eee;
      border: 1px solid #555; border-radius: 8px;
      padding: 6px 12px; cursor: pointer;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px; font-weight: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      user-select: none; margin-left: 8px;
      transition: background 0.2s, border-color 0.2s;
    `;
    btn.onmouseenter = () => { btn.style.borderColor = '#888'; };
    btn.onmouseleave = () => { btn.style.borderColor = '#555'; };

    const label = document.createElement('span');
    label.className = 'ce-label';
    label.textContent = '⬇ Export';

    const caret = document.createElement('span');
    caret.textContent = '▾';
    caret.style.cssText = 'font-size: 10px; opacity: 0.6; margin-left: 2px;';

    btn.appendChild(label);
    btn.appendChild(caret);

    btn.onclick = e => {
      e.stopPropagation();
      dropdownOpen ? closeDropdown() : openDropdown();
    };

    document.addEventListener('click', closeDropdown);
    return btn;
  }

  // ─── Inject into Claude's UI ───────────────────────────────────────────────

  async function inject() {
    if (document.getElementById('__claude_export_btn__')) return;

    try {
      await waitForUI('header, [data-testid="chat-title-button"]');

      const header = document.querySelector('header');
      if (!header) return;

      // Find rightmost div in the header to append to
      const rightSlot = header.querySelector('div:last-child') ?? header;
      exportBtn = buildButton();
      rightSlot.appendChild(exportBtn);

    } catch (e) {
      console.warn('[claude-export] Inject failed:', e.message);
    }
  }

  // ─── SPA navigation handling ───────────────────────────────────────────────

  let lastPath = location.pathname;

  function onNavigate() {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      document.getElementById('__claude_export_btn__')?.remove();
      exportBtn = null;
      dropdownOpen = false;
      setTimeout(inject, 1200);
    }
  }

  setInterval(onNavigate, 600);

  // ─── Boot ──────────────────────────────────────────────────────────────────

  inject();
})();
