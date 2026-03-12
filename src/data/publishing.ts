export interface GuideEntry {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  readTime: string;
  summary: string;
  bullets: string[];
}

export interface UpdateEntry {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  highlights: string[];
  linkedinUrl?: string;
  linkedinUrn?: string;
  links?: Array<{ label: string; href: string }>;
}

export const businessGuides: GuideEntry[] = [
  {
    id: "domain-hosting-basics",
    title: "Domain and Hosting: What Small Businesses Should Actually Pay",
    date: "2026-03-11",
    readTime: "6 min read",
    summary:
      "A practical breakdown of realistic domain and hosting budgets, common upsells, and what matters before paying for anything.",
    bullets: [
      "What is normal pricing vs. overpriced for domains and hosting",
      "When shared hosting is enough and when to upgrade",
      "How to avoid lock-in and hidden renewal costs",
    ],
  },
  {
    id: "website-vs-social-first",
    title: "Website First or Social Media First? A Decision Framework",
    date: "2026-03-11",
    readTime: "5 min read",
    summary:
      "How to decide where to spend limited time and budget first, based on your business type, conversion path, and customer behavior.",
    bullets: [
      "When a website gives immediate ROI",
      "When social should be your first focus",
      "A simple 30-day execution order for both",
    ],
  },
  {
    id: "graphic-design-spend",
    title: "Graphic Design Budgeting for Local Businesses",
    date: "2026-03-11",
    readTime: "7 min read",
    summary:
      "What design work is worth paying for now, what can wait, and how to prevent expensive redesign loops.",
    bullets: [
      "Brand essentials that affect sales",
      "What to template vs. what to custom-design",
      "How to scope design work so it stays affordable",
    ],
  },
];

export const progressUpdates: UpdateEntry[] = [
  {
    id: "linkedin-7436758651316547585",
    title: "HUB Third Avenue BID Tour + New Jacksonville Partnerships",
    date: "2026-03-09",
    summary:
      "Public update post documenting recent execution progress and current focus areas.",
    highlights: [
      "Timestamped public progress log",
      "LinkedIn publication for external visibility",
      "Feeds applicant and partner credibility",
    ],
    linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7436758651316547585",
    linkedinUrn: "urn:li:activity:7436758651316547585",
  },
  {
    id: "linkedin-7432782997528928256",
    title: "BID Tours Across NYC and Early Neighborhood Outreach",
    date: "2026-02-26",
    summary:
      "Public update post covering student expansion, execution priorities, and chapter development.",
    highlights: [
      "Timestamped public progress log",
      "LinkedIn publication for external visibility",
      "Feeds applicant and partner credibility",
    ],
    linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7432782997528928256",
    linkedinUrn: "urn:li:activity:7432782997528928256",
  },
  {
    id: "linkedin-7420976236715315200",
    title: "Spring 2026 Student Recruitment Announcement",
    date: "2026-01-24",
    summary:
      "Public update post on partner work, delivery outcomes, and next-stage priorities.",
    highlights: [
      "Timestamped public progress log",
      "LinkedIn publication for external visibility",
      "Feeds applicant and partner credibility",
    ],
    linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7420976236715315200",
    linkedinUrn: "urn:li:activity:7420976236715315200",
  },
];
