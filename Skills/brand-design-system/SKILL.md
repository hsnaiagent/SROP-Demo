---
name: brand-design-system
description: Defines the full visual design system to use whenever creating or styling any visual output — websites, mockups, slide decks, dashboards, diagrams, or documents. Use this any time you're about to make design decisions (colors, typography, cards, buttons, data displays), whether or not the user mentions "design," "branding," "theme," or "style." Covers both light and dark mode, and applies equally to web/HTML builds and presentation/slide builds.
---

# Brand Design System

A general-purpose visual language: colors, typography, and reusable component patterns. Apply it by default to any design task (web page, mockup, artifact, slide deck, dashboard, diagram) unless the user asks for something visually different for a one-off task.

## Colors

| Role | Light mode | Dark mode |
|------|-----------|-----------|
| Primary / background | White `#FFFFFF` | Dark navy `#0F1F35` |
| Secondary accent | Green `#00A651` | Green `#00A651` (unchanged) |
| Secondary accent | Blue `#003F8A` | Blue `#2E7FD6` (brightened for contrast on navy) |

- The only swap between light and dark mode is the primary/background color (white ↔ navy). The two accent colors stay conceptually the same; blue is brightened slightly in dark mode so it still reads clearly against the dark navy.
- Green and blue are **interchangeable secondary accents** — used for buttons, active states, highlights, chart series, gradients, and badges. They are not fixed to specific meanings; pick whichever gives better contrast/balance in context, or use both together to distinguish two things (e.g., two options being compared, two data series).
- Build supporting neutrals from the primary, not from unrelated colors: light-mode surfaces/borders are light grays (e.g. `#F3F6F8` surface, `#E8ECEF` secondary surface, `#DCE2E6` border, `#10131A` text, `#5B6670` muted text); dark-mode surfaces/borders are lighter steps of the navy (e.g. `#16283F` surface, `#1C3350` secondary surface, `#26405F` border, `#EAF0F6` text, `#8FA3B8` muted text).
- Implement as theme tokens/CSS variables (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--green`, `--blue`), not hardcoded hex values scattered through markup, so light/dark toggling is a single variable swap. In a slide deck, define the same roles as a master/theme color set instead of CSS variables.

## Typography

A three-font system, each with a distinct job — don't blend their roles:

- **Display / headings** — a geometric or grotesk sans with some character (e.g. Space Grotesk). Used for titles, section headers, slide titles, card/tab names. Slightly tightened letter-spacing (~-0.01em) at larger sizes.
- **Body** — a clean, highly readable sans (e.g. IBM Plex Sans). Used for paragraphs, buttons, UI labels, slide body text.
- **Technical / data** — a monospace face (e.g. IBM Plex Mono). Used for anything that reads as data, input, or system output: stats, timestamps, labels/badges, code-like values, captions, eyebrow/overline text, table values, chart axis labels. This is what gives the system its technical, precise feel — use it deliberately for numbers and short metadata, not for body prose.

On slides: titles in the display face, body copy in the body face, and any stat callouts, dates, or data labels in the mono face — this three-way split keeps a deck visually consistent with a web build.

## Component patterns

Reusable shapes that carry the visual identity — apply the same patterns whether building a webpage or a slide layout.

- **Cards**: rounded corners (12–18px), a thin 1px border in the border-token color, a soft two-layer shadow (a tight low-opacity shadow plus a larger soft one), background in the surface-token color. This is the default container for any discrete block of content — a feature, a stat, a slide content block.
- **Tabbed/segmented pickers**: a bordered card split into 2+ equal-width segments, each showing a name/title plus a one-line description; the active segment gets a highlighted background and a 2–3px colored underline (green or blue) at its bottom edge. Good for comparing options (plans, models, versions) both on web and as a slide layout device.
- **Stat/progress bars**: a label + a thin (5–6px) rounded horizontal bar, filled to a percentage in green or blue, with a small value readout beside the label. Useful for any before/after, comparison, or capability visualization — works well animated on web, static on a slide.
- **Chips/pills**: small rounded-full buttons/tags, bordered, muted text by default; active/selected state fills with a light tint of the accent color and colors the text and border to match. Use for filters, options, tags, or categories. Distinguish single-select groups (only one active at a time) from multi-select groups (several can be active) — both are valid, just be consistent within one group.
- **Badges**: small rounded-rectangle labels in the mono face, tinted background using a low-opacity accent color with matching text color, for short status/category callouts (e.g. "NEW", "FAST", type labels).
- **Gradient placeholder art**: when a real image isn't available for a mockup, use a soft diagonal CSS/SVG gradient built from the accent colors (green, blue, and the dark-navy tone) rather than a solid fill or an unrelated stock color — this keeps placeholder art visually on-brand. On slides, the same gradients work well as background treatments for section dividers or title slides.
- **Grid/contact-sheet motifs**: a grid of small square cells (uniform gaps, rounded corners) works well as a hero visual or section-divider motif — mix filled gradient cells with one or two "pending/loading" cells (neutral fill + a subtle animated diagonal shimmer) when representing an in-progress or generative process.

## General principles

- Keep corners consistently rounded across all components (don't mix sharp and rounded elements).
- Favor generous whitespace and a clear content-width container (e.g. max-width ~1100–1200px, centered, with side padding) over edge-to-edge layouts.
- Respect `prefers-reduced-motion` for any decorative animation (shimmer, transitions) in web builds.
- Maintain accessible contrast: verify text-on-surface and accent-on-surface combinations are legible in both light and dark mode, especially the brightened dark-mode blue against the dark navy background.
- If a one-off task calls for different colors or fonts, honor that request for that task without changing this default system going forward.
