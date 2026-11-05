import Link from "next/link";
import BlogCard from "@/components/BlogCard";
import Reveal from "@/components/Reveal";
import { latestBlogPosts } from "@/content/blog";

/**
 * Homepage blog section (Delta 3) — the latest three articles from
 * src/content/blog.ts. Renders nothing if the blog is ever emptied,
 * matching the testimonials section's no-content-no-section rule.
 */
export default function BlogSection() {
  const posts = latestBlogPosts(3);
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="blog-heading" className="bg-brand-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
                Our Blog
              </p>
              <h2
                id="blog-heading"
                className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl"
              >
                Notes on keeping clothes at their best
              </h2>
            </div>
            <Link
              href="/blog"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              All articles →
            </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.slug} delay={(i % 3) * 90} className="h-full">
              <BlogCard post={post} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
