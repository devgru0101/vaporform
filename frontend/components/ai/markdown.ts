/**
 * Lightweight Markdown Parser for Chat Messages
 * Converts markdown text to HTML for proper rendering
 */

export function parseMarkdown(text: string): string {
  if (!text) return '';

  let html = text;

  // Code blocks (```language\ncode\n```)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang ? ` data-language="${lang}"` : '';
    return `<pre><code${language}>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links ([text](url))
  html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Headers (### Header)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule (---)
  html = html.replace(/^---$/gm, '<hr/>');

  // Lists - unordered (- item or * item)
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Lists - ordered (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Blockquotes (> text)
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Preserve line breaks
  html = html.replace(/\n/g, '<br/>');

  return html;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
