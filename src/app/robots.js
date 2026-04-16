const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://oghmanotes.ie"
).replace(/\/$/, "");

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
