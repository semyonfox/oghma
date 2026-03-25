const authors = {
  samuel: {
    name: 'Samuel Regan',
    imageUrl: '/sam.jpeg',
    linkedin: 'https://www.linkedin.com/in/samuel-regan-464856331/',
  },
  semyon: {
    name: 'Semyon Fox',
    imageUrl: '/sem.jpeg',
    linkedin: 'https://www.linkedin.com/in/semyon-fox-968685249/',
  },
  shreyansh: {
    name: 'Shreyansh Singh',
    imageUrl: '/shrey.jpeg',
    linkedin: 'https://www.linkedin.com/in/shreyanshsinghss/',
  },
}

const blogPosts = [
  {
    slug: 'master-note-taking',
    title: 'Master Note-Taking: The Cornell Method with AI Assistance',
    author: authors.samuel,
    authorRole: 'RAG & Search',
    excerpt: 'Learn how to structure your notes using the Cornell Method and leverage OghmaNotes AI to automatically generate summaries and study guides from your notes.',
    date: 'Jan 15, 2025',
    datetime: '2025-01-15',
    imageUrl: 'https://images.unsplash.com/photo-1496128858413-b36217c2ce36?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=3603&q=80',
    intro: 'Learn how to structure your notes using the Cornell Method and leverage OghmaNotes AI to automatically generate summaries and study guides from your notes.',
    content: `The Cornell Method is one of the most effective note-taking systems ever developed. Combined with OghmaNotes AI, you can take your studying to the next level.

The Cornell Method divides your page into three sections:
- The note-taking area on the right (about 6 inches wide)
- The cues column on the left (about 2.5 inches wide)
- The summary area at the bottom

With OghmaNotes, you don't need to manually create these sections. Our AI automatically:
- Organizes your notes into the proper format
- Generates key concepts for the cues column
- Creates summaries automatically
- Suggests study questions based on your notes

This integration means you spend less time formatting and more time learning.`,
    highlights: [
      {
        title: 'Organized Structure',
        description: 'OghmaNotes automatically organizes your notes into the Cornell Method format, saving you hours of manual work.',
      },
      {
        title: 'AI-Generated Cues',
        description: 'Our AI analyzes your notes and creates meaningful cues that test your understanding of the material.',
      },
      {
        title: 'Automatic Summaries',
        description: 'Get concise summaries of each lecture without lifting a finger. Perfect for quick review before exams.',
      },
    ],
    section2Title: 'Transform Your Study Sessions in One Week',
    section2Content: `Students who adopt the Cornell Method with OghmaNotes report dramatic improvements in their grades and study efficiency. Most see results within just one week of consistent use.

The combination of structured note-taking and AI insights creates a powerful learning system that adapts to your needs.`,
    testimonial: {
      quote: 'I went from C grades to A grades just by using the Cornell Method with OghmaNotes. The AI summaries saved me so much time studying for finals.',
      author: 'Sarah Anderson',
      role: 'Computer Science Student',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    section3Title: 'Everything You Need to Master Your Subjects',
    section3Content: `With OghmaNotes and the Cornell Method, you have everything needed to excel academically. Stop struggling with disorganized notes and start studying smarter.

The platform is designed specifically for students who want to maximize their learning potential.`,
  },
  {
    slug: 'canvas-integration',
    title: 'Canvas Integration: Sync Your Assignments in One Click',
    author: authors.semyon,
    authorRole: 'Authentication & Backend',
    excerpt: 'Discover how to connect OghmaNotes to Canvas and never miss an assignment deadline again with automatic syncing.',
    date: 'Jan 10, 2025',
    datetime: '2025-01-10',
    imageUrl: 'https://images.unsplash.com/photo-1547586696-ea22b4d4235d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=3270&q=80',
    intro: 'Discover how to connect OghmaNotes to Canvas and never miss an assignment deadline again with automatic syncing.',
    content: `Manual assignment tracking across multiple courses is exhausting. With OghmaNotes Canvas integration, all your assignments, deadlines, and course materials sync automatically.

The integration works by:
- Connecting your Canvas account securely to OghmaNotes
- Automatically importing all your courses and assignments
- Keeping deadlines synchronized across both platforms
- Creating dedicated note folders for each course

Once connected, you'll have a centralized hub for all your academic work.`,
    highlights: [
      {
        title: 'One-Click Setup',
        description: 'Connect your Canvas account in seconds and automatically import all your courses and assignments.',
      },
      {
        title: 'Real-Time Syncing',
        description: 'Assignments and deadlines update instantly across OghmaNotes and Canvas.',
      },
      {
        title: 'Smart Organization',
        description: 'Notes are automatically organized by course, making them easy to find when you need them.',
      },
    ],
    section2Title: 'Stay on Top of Every Deadline',
    section2Content: `No more missed assignments. The Canvas integration ensures you never lose track of deadlines again. All your course materials are in one place, organized and easy to access.

Students using Canvas integration with OghmaNotes report 40% less time spent on assignment tracking.`,
    testimonial: {
      quote: 'The Canvas integration alone is worth the subscription. I used to switch between apps constantly, now everything is in one place.',
      author: 'James Wilson',
      role: 'Business Major',
      image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    section3Title: 'Streamline Your Academic Workflow',
    section3Content: `The Canvas integration is just the beginning. Combined with OghmaNotes other features, you get a complete academic management system designed specifically for modern students.

Never switch between apps again. Everything you need is in OghmaNotes.`,
  },
  {
    slug: 'study-tips',
    title: 'Transform Your Study Sessions: Tips from Top Performers',
    author: authors.shreyansh,
    authorRole: 'Infrastructure & AWS',
    excerpt: 'Real students share their strategies for using OghmaNotes to improve grades, stay organized, and reduce study time by 40%.',
    date: 'Jan 5, 2025',
    datetime: '2025-01-05',
    imageUrl: 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=3270&q=80',
    intro: 'Real students share their strategies for using OghmaNotes to improve grades, stay organized, and reduce study time by 40%.',
    content: `Top-performing students don't study harder—they study smarter. Here are the strategies that successful students are using with OghmaNotes.

The most common patterns among high-performing students:
- Taking notes immediately during lectures (not after)
- Using OghmaNotes AI to generate study questions
- Reviewing summaries daily instead of cramming
- Organizing notes by concepts, not by date
- Using the Canvas integration to track all work in one place

These simple changes compound over time to create dramatic improvements in grades and understanding.`,
    highlights: [
      {
        title: 'Daily Review Habit',
        description: 'Spending 15 minutes reviewing AI-generated summaries daily is more effective than 3 hours of cramming.',
      },
      {
        title: 'Concept-Based Organization',
        description: 'Organize notes by topic and concept, not chronologically. This mirrors how your brain stores information.',
      },
      {
        title: 'Active Recall Practice',
        description: 'Use OghmaNotes AI-generated questions to test yourself constantly. This is the most effective study technique.',
      },
    ],
    section2Title: 'Improve Your Grades in 30 Days',
    section2Content: `Implementing these strategies doesn't require overhauling your entire study routine. Start with just one or two and add more as they become habits.

Most students see noticeable grade improvements within just 30 days of consistent use.`,
    testimonial: {
      quote: 'My GPA went from 3.2 to 3.8 in one semester just by changing how I organized my notes. OghmaNotes made it so easy.',
      author: 'Alex Kumar',
      role: 'Engineering Student',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    section3Title: 'Start Your Journey to Academic Excellence',
    section3Content: `These strategies work because they align with how our brains actually learn. By combining proven study techniques with OghmaNotes powerful features, you create the perfect environment for academic success.

Your next 30 days could change your entire academic trajectory.`,
  },
]

const blogPostsBySlug = Object.fromEntries(blogPosts.map((post) => [post.slug, post]))

const blogCards = blogPosts.map(({ slug, title, excerpt, date, imageUrl, author, authorRole }) => ({
  slug,
  title,
  excerpt,
  date,
  imageUrl,
  author,
  authorRole,
}))

const aboutBlogCards = blogPosts.map(({ slug, title, date, datetime, imageUrl, author, authorRole }) => ({
  slug,
  title,
  date,
  datetime,
  imageUrl,
  author,
  authorRole,
}))

export { authors, blogPosts, blogPostsBySlug, blogCards, aboutBlogCards };
