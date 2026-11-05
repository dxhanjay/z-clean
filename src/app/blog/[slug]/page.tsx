import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BlogBody from "@/components/BlogBody";
import BlogCard from "@/components/BlogCard";
import CtaBand from "@/components/CtaBand";
import {
  blogPosts,
  formatBlogDate,
  getBlogPost,
  latestBlogPosts,
} from "@/content/blog";
import { getService } from "@/lib/services";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Article not found" };
  return { title: post.title, description: post.excerpt };
}

/**
 * Blog article (Delta 3) — hero cover, structured body, a related
 * service link (each article is tied to the service it discusses)
 * and the other articles. Statically generated from
 * src/content/blog.ts.
 */
export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const service = getService(post.serviceSlug);
  const more = latestBlogPosts(4).filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <article className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="text-sm font-semibold text-brand-700">
          <Link href="/blog" className="hover:underline">← All articles</Link>
        </p>
        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-brand-600">
          {post.tags.join(" · ")}
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
          {post.title}
        </h1>
        <p className="mt-4 text-sm font-semibold text-ink-500">
          {formatBlogDate(post.date)} · {post.readingMinutes} min read · By the
          Z-clean team
        </p>
        <img
          src={post.cover.src}
          alt={post.cover.alt}
          className="mt-8 aspect-[16/8] w-full rounded-3xl object-cover"
        />
        <BlogBody blocks={post.body} />

        {service && (
          <div className="mt-12 rounded-2xl bg-brand-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <h2 className="font-bold text-ink-900">
                Rather hand it over? {service.name}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                {service.shortDescription} Priced {service.unitLabel}, picked
                up from your door.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 sm:mt-0 sm:shrink-0">
              <Link
                href={`/services/${service.slug}`}
                className="rounded-full border border-brand-600 px-5 py-2.5 text-sm font-bold text-brand-700 transition-colors hover:bg-white"
              >
                About this service
              </Link>
              <Link
                href="/schedule-pickup"
                className="btn-press rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700"
              >
                Schedule a Pickup
              </Link>
            </div>
          </div>
        )}
      </article>

      {more.length > 0 && (
        <section aria-labelledby="more-heading" className="bg-white">
          <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
            <h2 id="more-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
              More from the blog
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((p) => (
                <BlogCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  );
}
