import type { BlogBlock } from "@/content/blog";

/**
 * Structured blog body renderer (Delta 3). Content lives as typed
 * blocks in src/content/blog.ts — paragraphs, sub-headings and
 * bullet lists — so articles render with the site's typography and
 * no markdown/HTML pipeline is involved.
 */
export default function BlogBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h2
              key={i}
              className="mt-10 text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl"
            >
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="mt-4 list-disc space-y-2 pl-5">
              {block.items.map((item, j) => (
                <li
                  key={j}
                  className="text-base leading-relaxed text-ink-700"
                >
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-4 text-base leading-relaxed text-ink-700">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
