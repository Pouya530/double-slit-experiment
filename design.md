# DESIGN.md — [Project Name]

> Design system reference for this project (built by Nocturnal Cloud). Use this document to maintain visual consistency when building new pages, components, or features.

---

## Brand Identity

- **Client:** [Client Name]
- **Site by:** Nocturnal Cloud (nocturnal.cloud)
- **Aesthetic:** [Describe the visual tone — e.g. cinematic, editorial, minimal. Describe the approach to imagery, typography, white space, colour, and UI density.]

---

## Design Tokens

### Colours

| Token | Value | Usage |
|-------|-------|-------|
| `--maintext` | `#1E1E1E` | Primary text, headings, dark backgrounds (footer, menu overlay) |
| `--greytext` | `#565656` | Secondary/supporting text, footer headings |
| `--lightgrey` | `#D9D9D9` | Borders, button backgrounds, subtle UI |
| `--verylightgrey` | `#EEE` | Page section backgrounds (e.g. grey spacer) |
| White | `#FFFFFF` | Body background, content areas |
| Credits grey | `#707070` | Footer credits, low-emphasis text |
| Link grey | `#797979` | Buttons, secondary headings |
| Border grey | `#CCC` | Section dividers |
| Accent primary | `#E91E63` | Hover accent (mix-blend-mode: difference) |
| Accent secondary | `#E91ECE` | Alternative hover accent |
| Accent tertiary | `#129079` | Button hover fill (mix-blend-mode: screen) |
| Dark overlay hover | `#474747` | List text rollover (mix-blend-mode: lighten) |
| Menu divider | `#3E3E3E` | Separator line within nav menu |

### Gradients

```css
/* Hero image shade — bottom and top vignette */
background: linear-gradient(182deg, rgba(0,0,0,0) 48.83%, rgba(0,0,0,0.70) 88.46%),
            linear-gradient(1deg, rgba(0,0,0,0) 65.66%, rgba(0,0,0,0.50) 98.46%);

/* Fullscreen story — left-side gradient */t
background: linear-gradient(270deg, rgba(0,0,0,0) 44.49%, rgba(0,0,0,0.80) 75.14%);

/* Card — bottom-up gradient */
background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 60%);
```

### Typography

| Element | Family | Size | Weight | Line Height | Letter Spacing |
|---------|--------|------|--------|-------------|----------------|
| **Body** | DM Sans | 16px | 400 | — | — |
| **H1** | DM Sans | `clamp(40px, 5vw, 160px)` | 600 | 110% | -0.02em |
| **H2** | DM Sans | `clamp(40px, 5vw, 160px)` | 600 | 100% | -0.02em |
| **H2 (smaller)** | DM Sans | 32px | 600 | 100% | — |
| **H2 superscript** | DM Sans | `clamp(12px, 1vw, 18px)` | 400 | 100% | 0 |
| **H3 (titles)** | DM Sans | 30px | 600 | 100% | -1.8px |
| **H3 (info)** | DM Sans | 30px | 700 | 120% | -1.2px |
| **Body text (descriptions)** | DM Sans | 20px | 300 | 150% | — |
| **Small label** | DM Sans | 16px | 400 | 120% | -0.64px |
| **Button text** | DM Sans | 12px | 600 | 100% | 2.4px (uppercase) |
| **Footer headings** | DM Sans | 14px | 500 | 100% | 0.4rem (uppercase) |
| **Credits** | DM Sans | 12px | — | — | — (uppercase) |
| **Nav links (main)** | DM Sans | `clamp(60px, 8vw, 160px)` | 600 | 100% | -0.02em |
| **Nav links (secondary)** | DM Sans | `clamp(14px, 2vw, 32px)` | — | — | — |
| **Category label** | DM Sans | 30px | 600 | 100% | -1.8px |
| **Headlines** | DM Sans | 30px | 600 | 100% | -1.2px |
| **Dates** | DM Sans | 14px | 600 | 100% | -0.84px |

**Font source:** Google Fonts — `DM Sans` with optical size axis (opsz 9–40), weight 100–1000, italic support.

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet">
```

### Spacing

| Token | Desktop | Mobile |
|-------|---------|--------|
| `--marginbetweemsections` | 120px | 60px |
| Inner spacer padding | 60px | 20px |
| Footer column gap | Implicit (50% / 1fr / 1fr grid) | Stacked, 60px gap |
| Grid gap (cards) | 40px | 20px |
| Grid gap (text list) | 40px horizontal, 80px vertical | 20px |

---

## Layout System

### Container / Spacer

No max-width wrapper — content uses `.innerspacer` with padding:

```css
.innerspacer {
    position: relative;
    padding: 60px;           /* Desktop */
    /* padding: 60px 20px;   /* Mobile */
}
```

### Grid Patterns

| Pattern | Desktop Columns | Mobile | Usage |
|---------|----------------|--------|-------|
| **Side-by-side (left)** | `56% 1fr` | `1fr` | Image + text sections |
| **Side-by-side (right)** | `1fr 56%` | `1fr` (reordered) | Alternating sections |
| **Card grid** | `1fr 1fr 1fr` | `1fr 1fr` | Listing grid |
| **Text list** | `1fr 1fr` | `1fr` | Text-only listing |
| **Info bar** | `1fr 1fr 1fr` | `1fr` | Metadata row (e.g. author, date, category) |
| **Detail layout** | `1fr 33.33%` | `1fr` | Description + sidebar |
| **Footer** | `50% 1fr 1fr` | `1fr` | Three-column footer |
| **Credits** | `1fr 1fr` | — | Two-column credits bar |
| **Content + thumbnail** | `1fr 33%` | `1fr` | Text + image aside |
| **Single post** | `1fr 1fr` (120px gap) | `1fr` (40px gap) | Single article layout |
| **Intro layout** | `33.33% 1fr` | `1fr` | Image/logo + text |
| **Contact** | `1fr 33.33%` | `1fr` | Text blocks + image |
| **Contact text** | `1fr 1fr` | `1fr` | Double text columns |
| **Team grid** | `1fr 1fr 1fr` | `1fr` | Team members |
| **Page header** | `1fr 33.33%` | `1fr` | Title + filter |

### Breakpoint

Single breakpoint: **800px**

```css
@media screen and (max-width: 799px) { /* Mobile */ }
@media screen and (min-width: 800px) { /* Desktop hover states */ }
```

---

## Component Patterns

### Hero (Homepage)

- Full viewport height (`100vh`), `background-color: black`
- Multiple background images absolutely positioned, swapped via JS (GSAP)
- Bottom-left title list with opacity states (active: `1`, inactive: `0.5`)
- Gradient overlay (`imageshade`) for text legibility
- Section margin: `var(--marginbetweemsections)` below

### Hero (Detail Page)

- `min-height: 80vh` (desktop), `50vh` (mobile)
- `background-color: var(--maintext)` fallback
- Image starts `opacity: 0; filter: blur(5px)` — animated in via JS
- Action button bottom-right, title bottom-left
- Grid: `1fr 180px` with 120px gap, aligned to bottom

### Navigation

- Burger menu: 2-line hamburger (1px lines, 6px apart) with "MENU" / "CLOSE" text labels
- Position: top-right, `60px` from edges (desktop), `20px` (mobile)
- Full-screen overlay: `background-color: var(--maintext)`, aligned bottom-left
- Main links: massive type (`clamp(60px, 8vw, 160px)`)
- Secondary links: smaller, displayed in a flex row with 40px gap
- Hover: all links dim to `opacity: 0.5`, hovered link returns to `1` with `padding-left: 10px`
- Divider line between main and secondary: `1px solid #3e3e3e`

### Logo

- Position: top-left, `60px` from edges (desktop), `20px` (mobile)
- Width: `70px` (desktop), `60px` (mobile)
- Dual versions: `.lightlogo` (white) and `.darklogo` (grey) — swapped via body class
- Hidden on homepage (`.home .whitelogo { display: none }`) — homepage has animated logo intro

### Buttons

**Primary arrow button (`.mainbutton`):**
- Uppercase, 12px, weight 600, letter-spacing 2.4px
- Colour: `#797979`
- Animated arrow: `::before` (extending line via `repeat-x`) + `::after` (arrow SVG)
- On hover: line extends to 120px width, arrow moves to 160px left
- White variant: `.mainbuttonwhite` — same pattern, white SVGs

**Play/Action button:**
- `border-radius: 10px`
- `background: rgba(0,0,0,0.50)` — semi-transparent dark
- Icon SVG as background-image, left-aligned
- Uppercase label, 12px, weight 600, letter-spacing 2.4px
- Hover: `::after` pseudo-element with `#e91ece` scales from 0 to 15x using `mix-blend-mode: difference`

**Secondary button:**
- `background-color: var(--lightgrey)`, no border-radius
- Icon SVG, left-padded
- Hover: `::after` with `#129079` fills width using `mix-blend-mode: screen`

**Footer subscribe button:**
- Black background, white text, `border-radius: 10px`, uppercase

### Cards (Listing)

- Image container: `aspect-ratio: 71/48`, `margin-bottom: 16px`
- Image: `object-fit: cover`, absolutely positioned, fills container
- Title: 30px, weight 600, below image
- Subtitle: 14px, weight 300, inline
- Meta text: 16px, weight 300

### Cards (Carousel)

- Width: `50%` (desktop), `100%` (mobile)
- `aspect-ratio: 1.2/1`, `margin-right: 20px`
- Title overlay: positioned absolute bottom, white text, slides up on hover
- Gradient: bottom-up dark gradient over image
- Uses Flickity carousel with custom arrow buttons (SVG backgrounds)

### Fullscreen Story Section

- `min-height: 100vh` (desktop), `50vh` (mobile)
- Full-bleed image with left-side gradient overlay
- Text constrained to `max-width: 500px`, padding 60px
- White text on dark overlay
- `display: grid; place-content: end; justify-content: start`

### Image Hover Effect (Homepage Sections)

- Image container: `aspect-ratio: 775/524`
- On hover (`.activator`): image scales to `1.01`
- White bars (20px) slide in from top and bottom via `::before` / `::after`
- Text holder gets `padding-bottom: 20px`
- Arrow button line extends

### Video Overlay

- Fixed, full viewport, `z-index: 9999`
- Glass background: `rgba(0,0,0,0.8)` with `backdrop-filter: blur(20px)`
- Video container: 60% width, 16:9 aspect ratio (`padding-bottom: 56.25%`)
- Close button: 34px SVG, top-right

### Photo Gallery Overlay

- Same glass background treatment
- Flickity carousel, images at 80% width / 80vh height, `object-fit: contain`
- Thumbnail grid: `1fr 1fr 1fr 1fr 1fr`, `gap: 10px`, `aspect-ratio: 1/1`

### Footer

- `background-color: var(--maintext)` (dark)
- Three columns: info (50%), pages, subscribe
- Headings: `#565656`, uppercase, 14px, weight 500, letter-spacing 0.4rem
- Links and text: white
- Address: 14px, `max-width: 260px`
- Subscribe input: black background, `border-radius: 10px`, white text
- Logo: 70px width, white version

### Credits Bar

- Same dark background as footer
- Two-column grid, right-aligned second column
- `#707070` text, 12px, uppercase

### 404 Page

- Centred, `min-height: 50vh`, `display: grid; place-items: center`
- "404" at 80px font size
- Simple paragraph with link to homepage

---

## Animation & Interaction

### Libraries Used

- **GSAP** (gsap.min.js) — core animation engine
- **ScrollTrigger** — scroll-based animations
- **SplitText** — text splitting for character/word/line animations
- **DrawSVGPlugin** — SVG path drawing (logo animation)
- **imagesLoaded** — wait for images before triggering animations
- **Flickity** — carousels (detail page stills, related items)
- **Fuse.js** — fuzzy search (CDN-loaded)

### Key Animations

- **Homepage intro:** Animated logo with SVG path drawing, images fade in
- **Detail hero:** Image starts `opacity: 0; filter: blur(5px)`, animates in
- **Scroll-triggered sections:** Image/text pairs animate via ScrollTrigger
- **Text splitting:** Headlines use SplitText for staggered reveals (`.splitter` class)
- **Hover transitions:** All set to `0.2s–0.3s ease-in-out`
- **Menu:** Background expands from right (`max-width: 0px` → full), links stagger in

### Transition Defaults

```css
transition: [property] 0.2s ease-in-out;  /* Standard */
transition: [property] 0.3s ease-in-out;  /* Buttons / larger movements */
```

---

## Image Handling

### Image Sizes

```
/* Define project-specific image sizes here */
hd:       1920 × 1200
hdextra:  2400 × 2000
fourkay:  3500 × 2000
/* Plus CMS defaults: thumbnail, medium, large, full */
```

### Aspect Ratios

| Context | Ratio | CSS |
|---------|-------|-----|
| Homepage hero image | Free (cover) | `object-fit: cover; width/height: 100%` |
| Card thumbnail | 71:48 | `aspect-ratio: 71/48` |
| Side-by-side image | 775:524 | `aspect-ratio: 775/524` |
| Related item card | 1.8:1 | `aspect-ratio: 1.8/1` |
| Related item container | 1.2:1 | `aspect-ratio: 1.2/1` |
| Content image | 427:285 | `aspect-ratio: 427/285` |
| Portrait image | 427:493 | `aspect-ratio: 427/493` |
| Thumbnail | 1:1 | `aspect-ratio: 1/1` |

### Fullscreen Pattern

```css
.fullscreen {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    object-fit: cover;
}
```

---

## Content Architecture

> Adapt this section to the CMS or framework in use (WordPress, Next.js, headless, etc.)

### Custom Post Types / Content Models

- **[post_type]** — [description, with relevant custom fields]

### Custom Fields

| Field | Type | Usage |
|-------|------|-------|
| `[field_name]` | [Type] | [Description] |

### Menus / Navigation Structure

- `main-menu` — Primary navigation (large links)
- `secondary-menu` — Secondary navigation (small links below divider)
- `footer-menu` — Footer page links

### Page Templates / Routes

| Template / Route | Purpose |
|------------------|---------|
| Homepage | [Description] |
| Listing | [Description] |
| Detail | [Description] |
| About | [Description] |
| Contact | [Description] |

---

## Page-Specific Behaviour

### Logo/Burger Colour Switching

The logo and burger menu switch between light (white) and dark (grey) versions based on page template:

- **Light logo + white burger:** Homepage, detail pages, about
- **Dark logo + dark burger:** Listing pages, contact, news, search
- **Menu open:** Always white logo + white burger (overrides above)

### Search

- Search icon positioned top-right, visibility toggled per template
- Search input: absolute positioned, black background, `border-radius: 10px`, hidden by default
- Uses Fuse.js for fuzzy client-side search

---

## Z-Index Stack

| Layer | Z-Index | Element |
|-------|---------|---------|
| Video/photo overlays | 9999 | `.overlayvideo`, `.overlayphotos`, close buttons |
| Logo | 9999 | `.whitelogo` |
| Search | 9999 | `.searchholder` |
| Homepage intro animation | 9990 | `.introbackground` |
| Intro logo | 9999 | `.middlebit` |
| Burger | 9988 | `.burgerone` |
| Menu overlay | 9986 | `.menu` |
| Background grey (menu) | 9985 | `.backgroundgrey` |
| Hero content | 20 | `.latestmovies` / hero text |
| Image overlays | 3 | `.imageshade` |
| Hover bars | 2 | `.imageholder::before/after` |

---

## Implementation Notes

1. **Single font family:** DM Sans handles everything — just vary weight (300, 400, 500, 600, 700) and size.
2. **No CSS framework** — all custom CSS with CSS custom properties. Grid-heavy layout.
3. **Hover states are desktop-only** — always wrap in `@media (min-width: 800px)`.
4. **mix-blend-mode is key** — used for button hovers (`difference`, `screen`, `lighten`) to create rich colour interactions without multiple colour variants.
5. **GSAP is the animation backbone** — don't use CSS animations for scroll-triggered or complex sequenced animations. Use GSAP + ScrollTrigger.
6. **Images are always cover-fitted** inside aspect-ratio containers — never use raw `<img>` without a container.
7. **The `.fullscreen` utility** is used pervasively — absolute positioned, 100% width/height, object-fit cover.
8. **Dark mode doesn't exist** — the site uses dark sections (footer, menu, heroes) within an otherwise light design.
9. **Form styling is minimal** — black inputs with border-radius 10px, no elaborate form components.
10. **Superscript pattern** — small, light-weight text positioned up and to the right of titles using `position: relative; top: -2vw`.
