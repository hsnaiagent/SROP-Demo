---
name: brand-palette
description: Defines the brand color palette to use whenever creating or styling any visual output — artifacts, mockups, UI components, dashboards, slides, diagrams, or web pages. Use this skill any time you're about to pick colors for a design, whether or not the user mentions "colors," "palette," "branding," or "theme." Applies to both light mode and dark mode designs.
---

# Brand Palette

This skill defines the required color palette for any visual/design work. Always apply these colors instead of default or generic ones when generating UI, mockups, artifacts, slides, or diagrams, unless the user explicitly requests different colors for a specific task.

## Light Mode (default)

| Role | Color | Hex |
|------|-------|-----|
| Primary (background/base) | White | `#FFFFFF` |
| Secondary | Green | `#00A651` |
| Secondary | Blue | `#003F8A` |

- White is the primary surface color — use it for backgrounds, cards, and base surfaces.
- Green (`#00A651`) and blue (`#003F8A`) are both secondary colors, used for accents, buttons, links, highlights, charts, and other UI elements that need emphasis. Treat them as interchangeable secondary options — choose whichever provides better contrast or visual balance in context, or use both together (e.g., to distinguish two data series or states).

## Dark Mode

Only one swap is needed to go from light to dark mode: replace white with a dark navy.

| Role | Color | Hex |
|------|-------|-----|
| Primary (background/base) | Dark navy | `#0F1F35` |
| Secondary | Green | `#00A651` |
| Secondary | Blue | `#003F8A` |

- Swap `#FFFFFF` → `#0F1F35` for all primary/background surfaces.
- The two secondary colors (green `#00A651`, blue `#003F8A`) stay exactly the same in both modes — do not adjust or lighten them for dark mode.
- Make sure text/foreground colors used against `#0F1F35` maintain sufficient contrast (e.g., off-white or light gray text, not pure black).

## Usage notes

- When building HTML/React/SVG artifacts, define these as CSS variables/theme tokens (e.g. `--color-primary`, `--color-secondary-green`, `--color-secondary-blue`) rather than hardcoding hex values throughout, so light/dark mode can toggle by swapping just the primary variable.
- If a design needs a neutral/tertiary color (e.g., borders, disabled states, subtle backgrounds), derive a light gray in light mode and a slightly lighter navy/gray in dark mode — don't invent unrelated colors.
- If the user asks for a one-off design in different colors, honor that request for that specific task without changing this default palette going forward.
