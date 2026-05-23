/**
 * Lightweight markdown-to-HTML converter.
 * Handles: **bold**, *italic*, `code`, bullet lists, numbered lists, line breaks, headings (###).
 * Strips AI-generated heading lines like "**Final Professional Video Summary:**".
 * No HTML escaping — content comes from the trusted backend AI.
 */

function applyInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_([^_]+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export function renderMarkdown(raw: string): string {
  const lines = raw.split("\n");
  const result: string[] = [];
  let inList: "ul" | "ol" | null = null;

  function closeList() {
    if (inList) {
      result.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Line-level detection (BEFORE inline formatting) ──

    // 1) Strip bold heading lines like "**Final Professional Video Summary:**" or "**Meeting Summary:**"
    if (/^\s*\*\*(Final|Professional|Comprehensive|Video|Summary|Meeting|Key|Overview|Tone|Style).+?\*\*\s*:?\s*$/i.test(line)) {
      closeList();
      continue;
    }

    // 2) Markdown headings: ### Title
    const headingMatch = line.match(/^\s*#{1,3}\s+(.+)/);
    if (headingMatch) {
      closeList();
      // Also check if the heading contains "meeting" keywords — skip it
      if (/\b(meeting|Meeting)\b/.test(headingMatch[1])) {
        continue;
      }
      result.push(`<h3 class="md-heading">${applyInline(headingMatch[1])}</h3>`);
      continue;
    }

    // 3) Bullet list: - item or * item
    const bulletMatch = line.match(/^\s*[\-\*]\s+(.+)/);
    if (bulletMatch && !bulletMatch[1].startsWith("*")) {
      if (inList !== "ul") {
        closeList();
        result.push('<ul style="margin:8px 0;padding-left:20px;">');
        inList = "ul";
      }
      result.push(`<li style="margin-bottom:4px;">${applyInline(bulletMatch[1])}</li>`);
      continue;
    }

    // 4) Numbered list: 1. item or 1) item
    const numMatch = line.match(/^\s*(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      if (inList !== "ol") {
        closeList();
        result.push('<ol style="margin:8px 0;padding-left:20px;">');
        inList = "ol";
      }
      result.push(`<li style="margin-bottom:4px;">${applyInline(numMatch[2])}</li>`);
      continue;
    }

    // 5) Empty line closes list, becomes <br/>
    if (line.trim() === "") {
      closeList();
      result.push("<br/>");
      continue;
    }

    // 6) Continuation of previous list item (indented text after a bullet)
    if (inList && result.length > 0) {
      const last = result[result.length - 1];
      if (last && last.endsWith("</li>")) {
        result[result.length - 1] = last.replace("</li>", " " + applyInline(line) + "</li>");
        continue;
      }
    }

    // 7) Regular paragraph — also filter meeting headings without bold markers
    closeList();
    if (/\bMeeting\b/i.test(line) && (line.includes("Summary") || line.includes("summar"))) {
      continue; // skip meeting summary lines
    }
    result.push(`<p style="margin:4px 0;">${applyInline(line)}</p>`);
  }

  closeList();

  return result.join("\n");
}