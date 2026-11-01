/**
 * A small part of Markdown as HTML, for the news window and the release notes: headings, paragraphs, lists, bold,
 * italics and code. Everything is escaped first, so the text can never bring its own HTML; links keep only their text
 * (the app opens no addresses from a text; the release page is one of its fixed links).
 */
export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | undefined;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join(' ')}</p>`);
    paragraph = [];
  };
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = undefined;
  };
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
      close();
    } else if (heading) {
      flush();
      close();
      // The window has its own title: the text's headings start one level below it.
      const level = Math.min(heading[1]!.length + 2, 6);
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1]!)}</li>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      close();
      out.push('<hr>');
    } else {
      close();
      paragraph.push(line.trim());
    }
  }
  flush();
  close();
  return out.join('\n');
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(text: string): string {
  // Code first, so that what is inside stays as it is.
  return escape(text)
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1
        ? `<code>${part.slice(1, -1)}</code>`
        : part
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
            .replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, '$1<em>$2</em>'),
    )
    .join('');
}
