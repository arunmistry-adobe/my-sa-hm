# footer

Site footer for H&M Saudi Arabia: link columns, newsletter sign-up, customer service and country info, legal line with social links, and a back-to-top button.

## Overview

The block loads the footer content document and renders it into three areas, one per authored section:

1. **Columns**: each heading followed by a list becomes a link column; a heading without a list becomes the newsletter column.
2. **Info**: customer service link, opening hours, logo, country name and "Change Country" link.
3. **Legal**: legal text, CR/VAT line and a paragraph of linked social icons.

## Authoring (Document Authoring)

Document: `/footer`. Keep it flat: top-level sections containing only headings, paragraphs, lists, links and images (no classes, forms or nested layout).

- **Link column**: `h3` heading followed by a list of links.
- **Newsletter column**: `h3` (or paragraph) intro text, a paragraph with the email field placeholder (also used as its hidden label), and a paragraph link whose text becomes the sign-up button label.
- **Images**: `<img src="images/name.svg">` paths are resolved against the footer document, so they work on every page.

## Configuration

| Source | Description |
|--------|-------------|
| `/footer.plain.html` | Footer content document. In the local preview (pages served under `/content/`) it is read from `/content/footer.plain.html` instead (`getContentPath()` in `scripts/scripts.js`). |

The page `footer` metadata is not used.

## Integration

- No URL parameters or localStorage.
- Keeps the boilerplate multistore store-switcher behaviour (`toggleStoreDropdown`).

## Behavior Patterns

- **Below 900px** the link columns are an accordion: the heading becomes a toggle button (`aria-expanded`), one column open at a time, the first open by default.
- **From 900px** the columns sit side by side and the toggles are inert.
- **Newsletter**: the email input and button are built in JS from the authored text. Submitting only validates the field locally; there is no newsletter backend yet.
- **Back to top**: a fixed button appears after scrolling 300px and scrolls the page to the top.

## Error Handling

- If the footer document can't be fetched, the block renders nothing and the page continues to load.
- Sections that are missing or authored in a different order are skipped rather than breaking the layout.
