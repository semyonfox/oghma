const authors = {
  samuel: {
    name: "Samuel Regan",
    imageUrl: "/sam.jpeg",
    linkedin: "https://www.linkedin.com/in/samuel-regan-464856331/",
  },
  semyon: {
    name: "Semyon Fox",
    imageUrl: "/sem.jpeg",
    linkedin: "https://www.linkedin.com/in/semyon-fox-968685249/",
  },
  shreyansh: {
    name: "Shreyansh Singh",
    imageUrl: "/shrey.jpeg",
    linkedin: "https://www.linkedin.com/in/shreyanshsinghss/",
  },
};

const blogPosts = [
  {
    slug: "canvas-first-study-system",
    title: "Why OghmaNotes Starts With Canvas",
    author: authors.semyon,
    authorRole: "Canvas Import & Infrastructure",
    excerpt:
      "NotebookLM is great once you feed it documents. OghmaNotes starts from the course you are actually taking.",
    date: "Jul 7, 2026",
    datetime: "2026-07-07",
    imageUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    intro:
      "The hardest part of using a study app is often the setup: finding files, uploading PDFs, naming notebooks, checking deadlines, and remembering what changed in Canvas.",
    content: `OghmaNotes is built around a different starting point. Instead of asking students to create a blank workspace, it connects to Canvas and imports the semester structure that already exists.

That means course files, lecture PDFs, assignment deadlines, and available course context can become part of the same study workspace. The AI features matter, but they are not the headline. The headline is that the system starts with the material students are already expected to learn.`,
    highlights: [
      {
        title: "Less setup",
        description:
          "Canvas import reduces the manual work of collecting lecture files and assignment context before studying can begin.",
      },
      {
        title: "Course-aware answers",
        description:
          "Questions can be grounded in the imported course material instead of generic web knowledge.",
      },
      {
        title: "Deadline context",
        description:
          "Assignments and due dates belong beside notes, flashcards, and revision planning, not in a separate tab students forget to check.",
      },
    ],
    section2Title: "The Product Promise",
    section2Content:
      "Connect Canvas once and your whole semester starts to assemble itself. Large imports may take background processing time, and available data depends on Canvas permissions, but the goal is simple: remove setup before exam stress hits.",
    callout:
      "NotebookLM is excellent for documents you upload. OghmaNotes is for the course you are actually taking.",
    section3Content:
      "This is why the landing page now leads with Canvas import, cited answers, flashcards, deadlines, and revision planning instead of technical language like RAG or semantic search.",
  },
  {
    slug: "canvas-import-limits",
    title: "Why Free Canvas Import Has Limits",
    author: authors.samuel,
    authorRole: "RAG & Search",
    excerpt:
      "A real Canvas history can contain thousands of pages, so OghmaNotes needs honest limits and background processing.",
    date: "Jul 7, 2026",
    datetime: "2026-07-07",
    imageUrl:
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80",
    intro:
      "The free import is the magic moment, but it cannot be unlimited. Real university courses include scanned slides, large PDFs, and historical files.",
    content: `OghmaNotes processes imported files so they can become searchable and useful for cited answers, flashcards, and revision planning. Some files are digital PDFs with easy text extraction. Others are scans or image-heavy slides that need OCR.

That processing has real cost. The product should let students see the value before paying, while also avoiding surprise backlog imports that silently process thousands of pages.`,
    highlights: [
      {
        title: "Free should show the value",
        description:
          "Students should be able to connect Canvas and see a limited course import before being asked to pay.",
      },
      {
        title: "Large histories need confirmation",
        description:
          "If a Canvas account exposes thousands of pages, OghmaNotes should estimate the workload and ask before processing everything.",
      },
      {
        title: "Background work should be visible",
        description:
          "OCR and indexing can take minutes. Honest progress and queue states are better than pretending every file is instant.",
      },
    ],
    section2Title: "The Launch Shape",
    section2Content:
      "The intended launch approach is a limited first import, practical page allowances, and clear upgrade paths for students with heavier course loads.",
    callout:
      "The free tier should create trust, not hide costs or make promises the import pipeline cannot keep.",
    section3Content:
      "This is also why OghmaNotes should price around semesters and academic years, not just a generic monthly SaaS subscription.",
  },
  {
    slug: "notebooklm-vs-oghmanotes",
    title: "NotebookLM vs OghmaNotes",
    author: authors.shreyansh,
    authorRole: "Product & Frontend",
    excerpt:
      "NotebookLM is excellent for uploaded sources. OghmaNotes is designed for Canvas-connected course context.",
    date: "Jul 7, 2026",
    datetime: "2026-07-07",
    imageUrl:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80",
    intro:
      "OghmaNotes should be honest about NotebookLM: it is a strong product. The difference is not that OghmaNotes is a smarter chatbot.",
    content: `NotebookLM is useful when you have the right sources ready to upload. It can help students explore documents, summarise material, and ask questions over selected sources.

OghmaNotes is designed for a different workflow. It starts from Canvas, where lectures, files, assignments, and deadlines already live. The aim is to reduce setup and keep studying connected to the student's actual course.`,
    highlights: [
      {
        title: "NotebookLM is source-first",
        description:
          "It works best after a student gathers and uploads the right documents.",
      },
      {
        title: "OghmaNotes is course-first",
        description:
          "It is built around Canvas import, coursework context, and revision planning.",
      },
      {
        title: "The practical difference is setup",
        description:
          "Students are busy and subscription-fatigued. The product should win by removing work before study starts.",
      },
    ],
    section2Title: "Who Should Use OghmaNotes?",
    section2Content:
      "OghmaNotes is best for students whose course material, deadlines, and feedback live in Canvas and who want one study system built around that reality.",
    callout:
      "The positioning is simple: not another AI notes app, but the study tool students do not have to set up.",
    section3Content:
      "The most important conversion moment is seeing a real semester appear after connection. Everything else should support that moment.",
  },
];

const blogPostsBySlug = Object.fromEntries(
  blogPosts.map((post) => [post.slug, post]),
);

const blogCards = blogPosts.map(
  ({ slug, title, excerpt, date, imageUrl, author, authorRole }) => ({
    slug,
    title,
    excerpt,
    date,
    imageUrl,
    author,
    authorRole,
  }),
);

const aboutBlogCards = blogPosts.map(
  ({ slug, title, date, datetime, imageUrl, author, authorRole }) => ({
    slug,
    title,
    date,
    datetime,
    imageUrl,
    author,
    authorRole,
  }),
);

export { authors, blogPosts, blogPostsBySlug, blogCards, aboutBlogCards };
