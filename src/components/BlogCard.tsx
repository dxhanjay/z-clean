import Link from "next/link";
import { formatBlogDate, type BlogPost } from "@/content/blog";

/** Blog post card — shared by /blog and the homepage blog section. */
export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/blog/${post.slug}`} className="block overflow-hidden">
        <img
          src={post.cover.src}
          alt={post.cover.alt}
          loading="lazy"
          className="h-44 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
          {formatBlogDate(post.date)} · {post.readingMinutes} min read
        </p>
        <h3 className="mt-2 text-lg font-bold leading-snug text-ink-900">
          <Link href={`/blog/${post.slug}`} className="hover:text-brand-800">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">
          {post.excerpt}
        </p>
        <Link
          href={`/blog/${post.slug}`}
          className="mt-4 text-sm font-semibold text-brand-700 hover:text-brand-800"
          aria-label={`Read: ${post.title}`}
        >
          Read article →
        </Link>
      </div>
    </article>
  );
}
