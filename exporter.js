/**
 * claude-export — src/exporter.js
 * Exports a Claude conversation to Markdown or JSON using the internal API.
 * No clipboard hacks. Works with conversations of any length.
 */

const ClaudeExport = (() => {
  // ─── Config ────────────────────────────────────────────────────────────────

  const DEFAULT_OPTIONS = {
    format: 'markdown',   // 'markdown' | 'json'
    includeTimestamps: true,
    includeBranches: false,  // include edited/branched messages
    openInTab: false,        // open result in new tab instead of downloading
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

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
    return content
      .map(block => {
        if (block.type === 'text') return block.text ?? '';
        if (block.type === 'tool_result') return `[Tool result: ${JSON.stringify(block.content)}]`;
        if (block.type === 'tool_use') return `[Tool call: ${block.name}(${JSON.stringify(block.input)})]`;
        if (block.type === 'image') return '[Image]';
        if (block.type === 'document') return '[Document]';
        return '';
      })
      .join('')
      .trim();
  }

  // ─── API ───────────────────────────────────────────────────────────────────

  async function fetchConversation() {
    const orgId = getOrgId();
    const convId = getConversationId();

    if (!orgId || !convId) {
      throw new Error('Could not determine org ID or conversation ID. Make sure you are on a conversation page.');
    }

    const url = `/api/organizations/${orgId}/chat_conversations/${convId}` +
      `?tree=true&rendering_mode=messages&render_all_tools=true`;

    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`API request failed: ${res.status} ${res.statusText}`);

    return res.json();
  }

  // ─── Parsing ───────────────────────────────────────────────────────────────

  function parseMessages(data, options) {
    const messages = data.chat_messages ?? [];

    return messages
      .filter(msg => {
        const text = extractText(msg.content);
        if (!text) return false;
        // Skip branch/edit duplicates unless requested
        if (!options.includeBranches && msg.parent_message_uuid) {
          // Only keep messages that are part of the main trunk
          // (heuristic: keep if no sibling with same parent exists later)
        }
        return true;
      })
      .map(msg => ({
        role: msg.sender === 'human' ? 'human' : 'assistant',
        text: extractText(msg.content),
        timestamp: msg.created_at ?? null,
        uuid: msg.uuid ?? null,
      }));
  }

  // ─── Formatters ────────────────────────────────────────────────────────────

  function toMarkdown(data, messages, options) {
    const title = data.name || 'Conversation with Claude';
    const created = data.created_at ? formatTimestamp(data.created_at) : '';

    let md = `# ${title}\n`;
    if (created) md += `*Exported on ${new Date().toLocaleDateString()} — conversation started ${created}*\n`;
    md += '\n---\n\n';

    for (const msg of messages) {
      const ts = options.includeTimestamps && msg.timestamp
        ? ` *(${formatTimestamp(msg.timestamp)})*`
        : '';

      if (msg.role === 'human') {
        md += `## 🧑 You${ts}\n\n${msg.text}\n\n`;
      } else {
        md += `## 🤖 Claude${ts}\n\n${msg.text}\n\n`;
      }
      md += '---\n\n';
    }

    return md;
  }

  function toJSON(data, messages) {
    return JSON.stringify({
      title: data.name || 'Conversation with Claude',
      conversation_id: data.uuid,
      created_at: data.created_at,
      exported_at: new Date().toISOString(),
      message_count: messages.length,
      messages,
    }, null, 2);
  }

  // ─── Download / Open ────────────────────────────────────────────────────────

  function download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function openInTab(content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  function createToast() {
    const toast = document.createElement('div');
    toast.id = '__claude_export_toast__';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      background: #1a1a2e; color: #e0e0e0;
      padding: 12px 18px; border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      border: 1px solid #333;
      min-width: 220px; max-width: 320px;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    return toast;
  }

  function removeToast(toast) {
    toast.style.opacity = '0';
    setTimeout(() => toast?.remove(), 400);
  }

  // ─── Main export ───────────────────────────────────────────────────────────

  async function run(userOptions = {}) {
    const options = { ...DEFAULT_OPTIONS, ...userOptions };
    const toast = createToast();

    try {
      toast.innerHTML = '⏳ Fetching conversation…';

      const data = await fetchConversation();
      const messages = parseMessages(data, options);

      if (messages.length === 0) throw new Error('No messages found in this conversation.');

      const slug = slugify(data.name);
      let content, filename, mimeType;

      if (options.format === 'json') {
        content = toJSON(data, messages);
        filename = `${slug}.json`;
        mimeType = 'application/json';
      } else {
        content = toMarkdown(data, messages, options);
        filename = `${slug}.md`;
        mimeType = 'text/markdown';
      }

      toast.innerHTML = `✅ ${messages.length} messages — saving <b>${filename}</b>`;

      if (options.openInTab) {
        openInTab(content, mimeType);
      } else {
        download(content, filename, mimeType);
      }

      setTimeout(() => removeToast(toast), 3000);

    } catch (err) {
      toast.style.border = '1px solid #c0392b';
      toast.innerHTML = `❌ ${err.message}`;
      console.error('[claude-export]', err);
      setTimeout(() => removeToast(toast), 5000);
    }
  }

  return { run };
})();

// Auto-run with defaults if loaded directly
ClaudeExport.run();
