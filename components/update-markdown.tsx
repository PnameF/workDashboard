import type { ReactNode } from "react";
function inline(text: string): ReactNode[] {
  return text
    .split(
      /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g,
    )
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith("~~") && part.endsWith("~~"))
        return <s key={i}>{part.slice(2, -2)}</s>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      return link ? (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      ) : (
        part
      );
    });
}
export default function UpdateMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = [],
    lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const list = /^\s*(- |\d+\. )/.exec(lines[i]);
    if (list) {
      const ordered = /\d/.test(list[1]),
        items: ReactNode[] = [];
      while (
        i < lines.length &&
        new RegExp(ordered ? "^\\s*\\d+\\. " : "^\\s*- ").test(lines[i])
      ) {
        items.push(
          <li key={i}>{inline(lines[i].replace(/^\s*(?:- |\d+\. )/, ""))}</li>,
        );
        i++;
      }
      i--;
      nodes.push(
        ordered ? (
          <ol key={"list" + i}>{items}</ol>
        ) : (
          <ul key={"list" + i}>{items}</ul>
        ),
      );
    } else
      nodes.push(
        lines[i].startsWith("> ") ? (
          <blockquote key={i}>{inline(lines[i].slice(2))}</blockquote>
        ) : (
          <p key={i}>{lines[i] ? inline(lines[i]) : <br />}</p>
        ),
      );
  }
  return <div className="update-markdown">{nodes}</div>;
}
