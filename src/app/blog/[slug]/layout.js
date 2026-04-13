import { blogPostsBySlug } from "@/lib/blog-data";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = blogPostsBySlug[slug];
  if (!post) return { title: "Post Not Found" };
  return {
    title: post.title,
    description: post.intro?.slice(0, 160) || post.excerpt?.slice(0, 160),
    openGraph: {
      title: post.title,
      description: post.intro?.slice(0, 160) || post.excerpt?.slice(0, 160),
      type: "article",
      url: `https://oghmanotes.ie/blog/${slug}`,
      images: post.imageUrl ? [{ url: post.imageUrl }] : undefined,
    },
  };
}

export default function BlogPostLayout({ children }) {
  return children;
}
