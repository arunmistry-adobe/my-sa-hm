# footer

Site footer for H&M Saudi Arabia: link columns, newsletter sign-up, customer service and country info, legal line with social links, and a back-to-top button.

## Overview

The block loads the footer content document and renders it into three areas, one per authored section:

1. **Columns**: each heading followed by a list becomes a link column; a heading without a list becomes the newsletter column.
2. **Info**: customer service link, opening hours, logo, country name and "Change Country" link.
3. **Legal**: legal text, CR/VAT line and a paragraph of linked social icons.

## Authoring (Document Authoring)

Documents: `/footer` (English) and `/ar/footer` (Arabic), with the same section structure. Keep them flat: top-level sections containing only headings, paragraphs, lists, links and images (no classes, forms or nested layout).

- **Link column**: `h3` heading followed by a list of links.
- **Newsletter column**: `h3` (or paragraph) intro text, a paragraph with the email field placeholder (also used as its hidden label), and a paragraph link whose text becomes the sign-up button label.
- **Images**: relative paths are resolved against the footer document, so they work on every page. `/footer` uses `images/name.svg`; `/ar/footer` reuses the same files via `../images/name.svg`.

## Configuration

| Source | Description |
|--------|-------------|
| `{prefix}/footer.plain.html` | Footer content document for the page language: `prefix` comes from `getLocale()` in `scripts/scripts.js` (`''` for English, `/ar` for Arabic pages). In the local preview (pages served under `/content/`) it is read from `/content{prefix}/footer.plain.html` instead (`getContentPath()`). |
| `/footer.plain.html` (fallback) | Requested only when a language-specific footer (non-empty prefix) can't be fetched. English pages make a single request. |

The page `footer` metadata is not used.

## Integration

- No URL parameters or localStorage.
- Keeps the boilerplate multistore store-switcher behaviour (`toggleStoreDropdown`).

## Behavior Patterns

- **Below 900px** the link columns are an accordion: the heading becomes a toggle button (`aria-expanded`), one column open at a time, the first open by default.
- **From 900px** the columns sit side by side and the toggles are inert.
- **Newsletter**: the email input and button are built in JS from the authored text. Submitting only validates the field locally; there is no newsletter backend yet.
- **Back to top**: a fixed button appears after scrolling 300px and scrolls the page to the top. Its accessible name is localised in `footer.js` (`UI_LABELS`, English and Arabic).
- **Right-to-left**: on Arabic pages (`<html dir="rtl">`, set by `scripts/scripts.js`) the layout mirrors through logical CSS properties and grid/flex flow: columns run right to left, the accordion +/− sits on the left, the sign-up button sits left of the email field, and the social icons and back-to-top button move to the left edge. No RTL-specific overrides are needed apart from the store-switcher chevron (`:dir(rtl)`).

## Error Handling

- If the footer document can't be fetched, the block renders nothing and the page continues to load.
- Sections that are missing or authored in a different order are skipped rather than breaking the layout.
