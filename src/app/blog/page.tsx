import type { Metadata } from "next";
import BlogCard from "@/components/BlogCard";
import CtaBand from "@/components/CtaBand";
import ScrollReveal3D from "@/components/motion/ScrollReveal3D";
import { latestBlogPosts } from "@/content/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Garment-care guides and laundry know-how from Z-clean: silk and festive wear care, choosing between wash & fold and dry cleaning, and beating monsoon damp in Bokaro Steel City.",
};

/**
 * Blog index (Delta 3). Articles are original site content in
 * src/content/blog.ts — garment-care guidance plus the handful of
 * Z-clean facts that are true on this site. No borrowed posts.
 */
export default function BlogPage() {
  const posts = latestBlogPosts(50);
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <ScrollReveal3D>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
            Our Blog
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Notes on keeping clothes at their best
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
            Practical garment care from the people who clean yours —
            what to wash, what to dry clean, and how to store the pieces
            you love.
          </p>
        </ScrollReveal3D>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <ScrollReveal3D key={post.slug} index={i % 3} className="h-full">
              <BlogCard post={post} />
            </ScrollReveal3D>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
