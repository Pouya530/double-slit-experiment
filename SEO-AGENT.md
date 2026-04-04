# SEO-AGENT.md — Nocturnal Cloud Universal SEO & AI Visibility Agent

## Agent ID: NC-008
## Version: 2.0 | April 2026
## Type: Growth / Technical SEO / AI Optimisation
## Reusable: Yes — deploy across all ventures
## Stack: Next.js (App Router), React, TypeScript, Tailwind CSS, Supabase

---

## 0. Purpose

This agent is responsible for ensuring every page across every Nocturnal Cloud venture is fully optimised for:

1. **Traditional SEO** — Google, Bing, and other search engines
2. **Answer Engine Optimisation (AEO)** — ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews
3. **Generative Engine Optimisation (GEO)** — ensuring content is cited in AI-generated answers
4. **Social sharing** — Open Graph, Twitter Cards, WhatsApp previews
5. **Accessibility** — semantic HTML that benefits both humans and machines

This agent should be invoked at project setup and revisited before every deployment.

---

## 1. Page-Level Metadata Checklist

Every page in every project MUST have the following metadata. No exceptions.

### 1.1 Next.js Metadata API (App Router)

Use the `generateMetadata` function or static `metadata` export in every `page.tsx` and `layout.tsx`.

```typescript
// src/app/layout.tsx — Root layout metadata
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://yourdomain.com'),
  title: {
    default: 'Site Name — Tagline',
    template: '%s | Site Name',
  },
  description: 'Concise, keyword-rich description under 160 characters. Front-load the value proposition.',
  keywords: ['primary keyword', 'secondary keyword', 'brand name'],
  authors: [{ name: 'Author Name', url: 'https://yourdomain.com' }],
  creator: 'Nocturnal Cloud Ltd',
  publisher: 'Nocturnal Cloud Ltd',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://yourdomain.com',
    siteName: 'Site Name',
    title: 'Site Name — Tagline',
    description: 'Same or slightly varied description for social sharing.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Descriptive alt text for the OG image',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Site Name — Tagline',
    description: 'Concise description for Twitter/X cards.',
    images: ['/og-image.png'],
    creator: '@handle',
  },
  alternates: {
    canonical: 'https://yourdomain.com',
  },
  category: 'technology', // or relevant category
};
```

### 1.2 Dynamic Page Metadata

For dynamic routes (e.g. `/blog/[slug]`, `/products/[id]`):

```typescript
// src/app/blog/[slug]/page.tsx
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      images: [
        {
          url: post.featuredImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.featuredImage],
    },
    alternates: {
      canonical: `https://yourdomain.com/blog/${slug}`,
    },
  };
}
```

### 1.3 Metadata Validation Checklist

Before deploying any page, confirm:

- [ ] `<title>` is unique, under 60 characters, front-loads primary keyword
- [ ] `<meta name="description">` is unique, under 160 characters, includes CTA or value prop
- [ ] Canonical URL is set and correct (no trailing slashes inconsistency)
- [ ] OG image exists, is 1200×630px, and has descriptive alt text
- [ ] Twitter card renders correctly (test at cards-dev.twitter.com)
- [ ] No duplicate metadata across pages
- [ ] `robots` meta is correct (index/noindex as intended)

---

## 2. JSON-LD Structured Data (Schema.org)

Every page MUST include appropriate JSON-LD. This is critical for both Google rich results and AI answer engines.

### 2.1 Reusable JSON-LD Component

```typescript
// src/components/seo/JsonLd.tsx
interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data, null, 0).replace(/</g, '\\u003c'),
      }}
    />
  );
}
```

### 2.2 Required Schema Types by Page Type

#### Organisation (root layout — every site)

```typescript
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Company Name',
  url: 'https://yourdomain.com',
  logo: 'https://yourdomain.com/logo.png',
  description: 'What the company does in one sentence.',
  foundingDate: '2024',
  founder: {
    '@type': 'Person',
    name: 'Founder Name',
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'London',
    addressCountry: 'GB',
  },
  sameAs: [
    'https://twitter.com/handle',
    'https://linkedin.com/company/handle',
    'https://github.com/handle',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'hello@yourdomain.com',
  },
};
```

#### WebSite with SearchAction (homepage)

```typescript
const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Site Name',
  url: 'https://yourdomain.com',
  description: 'Site description.',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://yourdomain.com/search?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};
```

#### WebPage (every page)

```typescript
const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Page Title',
  description: 'Page description.',
  url: 'https://yourdomain.com/page',
  isPartOf: {
    '@type': 'WebSite',
    name: 'Site Name',
    url: 'https://yourdomain.com',
  },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItemElement',
        position: 1,
        name: 'Home',
        item: 'https://yourdomain.com',
      },
      {
        '@type': 'ListItemElement',
        position: 2,
        name: 'Page Name',
        item: 'https://yourdomain.com/page',
      },
    ],
  },
};
```

#### Article / BlogPosting (blog posts)

```typescript
const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article', // or 'BlogPosting'
  headline: 'Article Title',
  description: 'Article summary.',
  image: 'https://yourdomain.com/images/article-hero.jpg',
  datePublished: '2026-04-04T00:00:00Z',
  dateModified: '2026-04-04T00:00:00Z',
  author: {
    '@type': 'Person',
    name: 'Author Name',
    url: 'https://yourdomain.com/about',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Company Name',
    logo: {
      '@type': 'ImageObject',
      url: 'https://yourdomain.com/logo.png',
    },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://yourdomain.com/blog/article-slug',
  },
};
```

#### SoftwareApplication (product/SaaS pages)

```typescript
const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Product Name',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'What the product does.',
  url: 'https://yourdomain.com',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'GBP',
    availability: 'https://schema.org/InStock',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '150',
  },
};
```

#### FAQPage (landing pages, support pages)

```typescript
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What does this product do?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Clear, concise answer that AI can extract directly.',
      },
    },
    // Add more Q&A pairs
  ],
};
```

#### HowTo (tutorial/guide pages)

```typescript
const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Do Something',
  description: 'Step-by-step guide.',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Step 1',
      text: 'Description of step 1.',
    },
  ],
};
```

### 2.3 Schema Validation

Before every deployment, validate structured data using:

- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org
- Check Google Search Console for structured data errors post-deploy

---

## 3. AI Crawler Optimisation

### 3.1 robots.txt

Create `public/robots.txt` that explicitly allows AI crawlers:

```
# Traditional search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# AI Crawlers — ALLOW for AI visibility
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: cohere-ai
Allow: /

# Block aggressive training-only bots (no referral value)
User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: PetalBot
Disallow: /

# General
User-agent: *
Allow: /

# Paths to block for all
Disallow: /api/
Disallow: /admin/
Disallow: /_next/
Disallow: /private/

# Sitemap
Sitemap: https://yourdomain.com/sitemap.xml
```

### 3.2 llms.txt — AI Content Index

Create `public/llms.txt` at the site root. This is an emerging standard that helps AI systems understand your site structure.

```markdown
# Site Name

> One-sentence description of what this site/product does.

## About

Company/product overview in 2-3 sentences. What problem it solves, who it's for, and what makes it unique.

## Key Pages

- [Homepage](https://yourdomain.com): Main landing page with product overview
- [Features](https://yourdomain.com/features): Core product capabilities
- [Pricing](https://yourdomain.com/pricing): Plans and pricing information
- [Documentation](https://yourdomain.com/docs): Technical documentation
- [Blog](https://yourdomain.com/blog): Articles, guides, and updates
- [About](https://yourdomain.com/about): Company information and team
- [Contact](https://yourdomain.com/contact): Get in touch

## Documentation

- [Getting Started](https://yourdomain.com/docs/getting-started): Quick start guide
- [API Reference](https://yourdomain.com/docs/api): API documentation
- [FAQ](https://yourdomain.com/faq): Frequently asked questions

## Contact

- Email: hello@yourdomain.com
- Location: London, UK
```

Optionally create `public/llms-full.txt` — a complete text export of your most important content for deeper AI indexing.

### 3.3 AI-Friendly Content Structure Rules

Apply these rules to every page:

1. **Server-side render all important content** — AI crawlers do not execute JavaScript. Content behind client-side rendering, tabs, accordions, or modals is invisible to AI bots. Use SSR or SSG for all content pages.

2. **Front-load answers** — Put the most important information in the first paragraph. AI systems extract from the top of the page. Do not bury key information below fold.

3. **Use clear heading hierarchy** — `<h1>` once per page (the page title), then `<h2>`, `<h3>` etc. in logical order. Never skip levels.

4. **Write in extractable format** — Short paragraphs (2-3 sentences max). Direct, factual language. Avoid walls of text. Use the "inverted pyramid" — most important info first.

5. **Include entity-rich content** — Name specific people, places, organisations, technologies, dates. AI systems build knowledge graphs from named entities.

6. **Answer questions directly** — If a section answers a question, state the question as a heading and answer it immediately below. This maps directly to how AI retrieves answers.

7. **Keep content fresh** — AI systems have a strong recency bias. Content over 3 months old sees significantly fewer citations. Add `dateModified` to schema and actually update content regularly.

---

## 4. Technical SEO Infrastructure

### 4.1 Sitemap Generation

Use Next.js built-in sitemap generation:

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://yourdomain.com';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];

  // Dynamic pages (e.g. blog posts from Supabase)
  // const { data: posts } = await supabase
  //   .from('posts')
  //   .select('slug, updated_at')
  //   .eq('status', 'published');
  //
  // const blogPages = posts?.map((post) => ({
  //   url: `${baseUrl}/blog/${post.slug}`,
  //   lastModified: new Date(post.updated_at),
  //   changeFrequency: 'weekly' as const,
  //   priority: 0.7,
  // })) ?? [];

  return [...staticPages];
}
```

### 4.2 robots.txt via Next.js

```typescript
// src/app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/private/'],
      },
      {
        userAgent: 'CCBot',
        disallow: '/',
      },
      {
        userAgent: 'Bytespider',
        disallow: '/',
      },
    ],
    sitemap: 'https://yourdomain.com/sitemap.xml',
  };
}
```

**Note:** The programmatic `robots.ts` does not support per-bot `Allow` directives cleanly. For full AI crawler control with explicit `Allow` rules per bot, use the static `public/robots.txt` file from Section 3.1 instead.

### 4.3 Canonical URLs & Trailing Slashes

In `next.config.ts`:

```typescript
const nextConfig = {
  trailingSlash: false, // Pick one and be consistent
  // ... other config
};
```

Ensure every page has a canonical URL set via the metadata API. This prevents duplicate content issues.

### 4.4 Performance & Core Web Vitals

AI crawlers and Google both reward fast sites. Ensure:

- **LCP (Largest Contentful Paint)** < 2.5s
- **FID (First Input Delay)** < 100ms
- **CLS (Cumulative Layout Shift)** < 0.1
- Use `next/image` for all images (automatic WebP/AVIF, lazy loading, srcset)
- Use `next/font` for self-hosted fonts (no layout shift from font loading)
- Minimise client-side JavaScript — SSR/SSG wherever possible
- Enable gzip/brotli compression

### 4.5 Image SEO

```typescript
import Image from 'next/image';

// Every image MUST have:
<Image
  src="/hero.jpg"
  alt="Descriptive alt text — not just 'image' or 'photo'"
  width={1200}
  height={630}
  priority // for above-fold images
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 1200px"
/>
```

- Alt text on every image — descriptive, keyword-relevant, not stuffed
- Use `priority` on above-fold hero images
- Use `sizes` prop for responsive images
- Provide OG images (1200×630) for every shareable page

---

## 5. Semantic HTML for AI Readability

### 5.1 Page Structure Template

Every content page should follow this semantic structure:

```html
<main>
  <article>
    <header>
      <h1>Page Title (One Per Page)</h1>
      <p>Publish date, author, category metadata</p>
    </header>

    <section>
      <h2>Section Heading</h2>
      <p>Content with clear, extractable information.</p>
    </section>

    <section>
      <h2>Another Section</h2>
      <p>More content.</p>
    </section>

    <footer>
      <p>Author bio, related links</p>
    </footer>
  </article>

  <aside>
    <nav aria-label="Table of contents">
      <!-- TOC for long-form content -->
    </nav>
  </aside>
</main>
```

### 5.2 Accessibility Requirements (Overlap with SEO)

- Every `<img>` has meaningful `alt` text
- Every `<a>` has descriptive link text (never "click here")
- Use `aria-label` on navigation elements
- Proper heading hierarchy (h1 → h2 → h3, no skipping)
- Language attribute on `<html lang="en-GB">`
- Skip-to-content link for keyboard navigation
- Colour contrast ratio minimum 4.5:1

---

## 6. Open Graph & Social Sharing

### 6.1 OG Image Strategy

Create a reusable OG image generation system:

```typescript
// src/app/api/og/route.tsx (Next.js Edge OG Image Generation)
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'Default Title';
  const description = searchParams.get('description') || '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          backgroundColor: '#0a0a0a',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 700, color: '#ffffff', lineHeight: 1.1 }}>
          {title}
        </div>
        {description && (
          <div style={{ fontSize: 28, color: '#a0a0a0', marginTop: 20 }}>
            {description}
          </div>
        )}
        <div style={{ fontSize: 24, color: '#666', marginTop: 40 }}>
          yourdomain.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

Then reference in dynamic metadata:

```typescript
images: [
  {
    url: `/api/og?title=${encodeURIComponent(post.title)}&description=${encodeURIComponent(post.excerpt)}`,
    width: 1200,
    height: 630,
    alt: post.title,
  },
],
```

### 6.2 Social Platform Specifics

- **Facebook/LinkedIn**: Use `og:` tags. Image 1200×630. Description under 200 chars.
- **Twitter/X**: Use `twitter:card` = `summary_large_image`. Image 1200×628.
- **WhatsApp**: Reads `og:title`, `og:description`, `og:image`. Keep title under 65 chars.
- **Slack**: Reads `og:` tags. Ensure `og:site_name` is set.
- **Discord**: Reads `og:` tags. Supports `theme-color` meta for embed colour.

Add theme-color for Discord/browser chrome:

```typescript
// In metadata
other: {
  'theme-color': '#0a0a0a',
},
```

---

## 7. E-E-A-T Signals (Experience, Expertise, Authoritativeness, Trustworthiness)

AI systems and Google both evaluate content trustworthiness. Implement these:

### 7.1 Author Pages

Every content piece should link to an author profile page with:

- Full name and photo
- Bio with relevant credentials
- Links to social profiles (builds entity recognition)
- List of published articles
- JSON-LD `Person` schema on author pages

### 7.2 About Page

Must include:

- Company history and mission
- Team members with credentials
- Physical address (if applicable)
- Contact information
- Awards, press mentions, partnerships
- JSON-LD `Organization` schema

### 7.3 Trust Signals

- Display client logos/testimonials
- Link to privacy policy and terms
- Show security badges if handling data
- Cite sources in content
- Display last-updated dates on all content
- HTTPS everywhere (obvious but verify)

---

## 8. Monitoring & Analytics Setup

### 8.1 Required Accounts

Set up for every project:

- [ ] Google Search Console — submit sitemap, monitor indexing, check structured data
- [ ] Google Analytics 4 — traffic, engagement, conversion tracking
- [ ] Bing Webmaster Tools — submit sitemap, monitor Bing/AI indexing
- [ ] Cloudflare Analytics (if using CF) — monitor AI bot traffic

### 8.2 AI Visibility Monitoring

Track these regularly:

- Search your brand name in ChatGPT, Perplexity, and Google AI Overviews
- Monitor referral traffic from AI sources (check analytics for `chatgpt.com`, `perplexity.ai`, etc.)
- Check server logs for AI crawler activity (GPTBot, ClaudeBot, PerplexityBot user agents)
- Verify Cloudflare isn't blocking AI bots (check AI bot settings — Cloudflare defaults to blocking)

### 8.3 SEO Audit Frequency

- **Weekly**: Check Search Console for crawl errors, new 404s, structured data issues
- **Monthly**: Review keyword rankings, AI citation presence, Core Web Vitals
- **Quarterly**: Full technical audit, content freshness review, competitor analysis
- **Per deploy**: Validate structured data, check OG images, test robots.txt

---

## 9. Pre-Launch SEO Checklist

Run this checklist before every deployment:

### Metadata & Content
- [ ] Every page has unique `<title>` (under 60 chars)
- [ ] Every page has unique `<meta description>` (under 160 chars)
- [ ] Every page has canonical URL set
- [ ] H1 on every page, used only once, contains primary keyword
- [ ] Heading hierarchy is correct (h1 → h2 → h3, no skips)
- [ ] All images have descriptive alt text
- [ ] All links have descriptive anchor text

### Structured Data
- [ ] Organisation schema on root layout
- [ ] WebSite schema on homepage
- [ ] Appropriate schema type on every content page (Article, Product, FAQ, etc.)
- [ ] All schema validates via Rich Results Test
- [ ] BreadcrumbList schema on pages 2+ levels deep

### Technical
- [ ] `sitemap.xml` generates correctly and includes all public pages
- [ ] `robots.txt` allows AI crawlers (GPTBot, ClaudeBot, PerplexityBot)
- [ ] `llms.txt` is present at site root with key page index
- [ ] No broken links (run a crawl)
- [ ] No orphan pages (every page linked from at least one other page)
- [ ] 301 redirects in place for any changed URLs
- [ ] HTTPS enforced, no mixed content
- [ ] Core Web Vitals pass (LCP < 2.5s, CLS < 0.1)
- [ ] Mobile responsive (test at multiple breakpoints)

### Social & Sharing
- [ ] OG images (1200×630) for all key pages
- [ ] OG title, description, and image render correctly
- [ ] Twitter card renders correctly
- [ ] Favicon and apple-touch-icon present

### AI Optimisation
- [ ] Important content is server-rendered (not behind JS)
- [ ] Content follows inverted pyramid (answer first, detail after)
- [ ] FAQ content uses question-answer format with FAQPage schema
- [ ] Content includes named entities (people, places, orgs, dates)
- [ ] `dateModified` is accurate on all content
- [ ] No content hidden behind tabs/accordions/modals
- [ ] Cloudflare AI bot blocking is disabled (if using CF)

---

## 10. File Structure Reference

```
project-root/
├── public/
│   ├── robots.txt          # AI-friendly crawler rules (static version)
│   ├── llms.txt            # AI content index
│   ├── llms-full.txt       # Optional: full content export for AI
│   ├── og-image.png        # Default OG image (1200×630)
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   └── site.webmanifest
├── src/
│   ├── app/
│   │   ├── layout.tsx      # Root metadata + Organisation schema
│   │   ├── page.tsx        # Homepage + WebSite schema
│   │   ├── sitemap.ts      # Auto-generated sitemap
│   │   ├── robots.ts       # Programmatic robots (alternative to static)
│   │   ├── api/og/route.tsx # Dynamic OG image generation
│   │   └── blog/
│   │       └── [slug]/
│   │           └── page.tsx # Dynamic metadata + Article schema
│   └── components/
│       └── seo/
│           ├── JsonLd.tsx   # Reusable JSON-LD component
│           ├── Breadcrumbs.tsx
│           └── StructuredData.tsx  # Page-type schema factory
└── next.config.ts           # trailingSlash, image domains, headers
```

---

## 11. Security Headers for SEO

Add in `next.config.ts` or middleware:

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};
```

These headers signal a well-maintained, trustworthy site — an indirect SEO and E-E-A-T signal.

---

## 12. Inter-Agent Communication

### Inputs This Agent Receives

| From Agent | Input | Format |
|-----------|-------|--------|
| NC-001 Architect | Site structure, page inventory | SPEC.md |
| NC-002 Frontend | Component structure, route map | Code review |
| NC-007 Copy & Content | Page copy, blog content | Markdown / CMS |
| NC-010 Security Auditor | Security header recommendations | Audit report |

### Outputs This Agent Produces

| To Agent | Output | Format |
|---------|--------|--------|
| NC-002 Frontend | Metadata templates, JSON-LD components | TypeScript files |
| NC-005 DevOps | robots.txt, sitemap config, headers | Config files |
| NC-007 Copy & Content | SEO content guidelines, keyword targets | Markdown brief |
| NC-012 Sprint Planner | SEO task backlog, audit findings | Task list |

### Handoff Protocol

1. Agent receives page inventory from Architect (NC-001)
2. Agent generates metadata templates and JSON-LD schemas
3. Agent creates robots.txt, llms.txt, sitemap config
4. Agent hands component code to Frontend (NC-002) for integration
5. Agent validates post-integration via automated checks
6. Agent reports findings to Sprint Planner (NC-012) for tracking

---

## 13. Quick-Start: Minimum Viable SEO

If time is tight, implement at minimum:

1. **Root layout metadata** with title template, description, OG image (Section 1.1)
2. **Organisation + WebSite JSON-LD** on homepage (Section 2.2)
3. **sitemap.ts** with all public pages (Section 4.1)
4. **robots.txt** allowing AI crawlers (Section 3.1)
5. **llms.txt** with key page index (Section 3.2)
6. **Canonical URLs** on every page (Section 1.1)
7. **OG images** for homepage and key landing pages (Section 6)

This baseline takes ~1 hour to implement and covers 80% of the value.

---

*Agent maintained by Nocturnal Cloud Ltd. Last updated: April 2026.*
*Deploy across: PropRank, Spawnify, CrystalTone, CopperForge, Double Slit, NodeGuard, PROVNET, and all future ventures.*
