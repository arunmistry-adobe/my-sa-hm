# Header Block

## Overview

The Header block renders the H&M header: a promo strip, the main row (logo, hamburger, department tabs, Commerce tools, language switcher) and a left drawer with per-department menus, drill-down sub-panels, utility links and promo cards. It keeps the Commerce drop-in integrations: authentication dropdown (sign in/sign out), wishlist access, mini cart with lazy loading, and product search with live results.

## Integration

### Block Configuration

No block configuration is read via `readBlockConfig()`. The header uses metadata tags for fragment paths.

### URL Parameters

No URL parameters are directly read by the header block.

### Local Storage

No localStorage keys are used directly by this block. Authentication and cart state are managed through cookies and the event bus.

### Events

#### Event Listeners

- `events.on('cart/data', callback)` - Updates cart item counter and preloads mini cart fragment when cart data changes (eager loading enabled)
- `events.on('authenticated', callback)` - Handled in `renderAuthCombine.js` and `renderAuthDropdown.js` for authentication state changes

#### Event Emitters

No events are directly emitted by this block. However, it triggers events indirectly through imported modules:
- Mini cart triggers `publishShoppingCartViewEvent()` when opened
- Search triggers product discovery events through the search dropin

### Metadata

The block reads the following metadata tags:

- `nav` - not used. The nav document is chosen by the page's language (`getLocale()`). It is `{prefix}/nav.plain.html` (e.g. `/ar/nav.plain.html` for Arabic pages), with `/nav.plain.html` as the fallback when a language folder has no nav. Both are under `/content/` when the page itself is served from there (local preview)
- `wishlist` - Path to wishlist page (default: `/wishlist`)
- `mini-cart` - Path to mini cart fragment (default: `/mini-cart`)

## Behavior Patterns

### Page Context Detection

- **All viewports**: The hamburger opens the department drawer with an overlay. From 900px the department tabs are also shown in the main row
- **Checkout Pages**: Mini cart button is hidden on `/checkout` path

### Navigation Structure (authoring convention for `nav`)

The nav document is flat: top-level sections only, holding headings, paragraphs, lists, links, bold/italic and images. No copy is hard-coded in the block. Every section is optional and is recognised by its content, in this order:

1. **Promo strip** – a paragraph with the message, plus a paragraph with a link (e.g. `ALL BRANDS`). It is rendered as the grey top row.
2. **Brand** – a paragraph holding the logo image, linked to the home page (`<a href="…"><img src="images/hm-logo.svg" alt="H&M"></a>`).
3. **Departments** – one bulleted list. Each top-level item is a department:
   - the item's own link is the tab (label + URL) in the main row and in the drawer;
   - each nested list under it is a **group** of level-3 menu items. A new nested list starts a new group, and the drawer leaves an extra gap (46px) between groups. This replaces the source's "padding-bottom" flag;
   - a level-3 item can contain its own nested lists with level-4 links (start with a `View All` link if needed). Those items open a drill-down sub-panel with a back arrow and the item label as its heading. Several nested lists here are again groups with a gap between them;
   - **bold** (`<strong>`) makes an item large and bold; *italic* (`<em>`) makes it red (H&M sale red). Both can be combined;
   - a nested list whose items contain an **image** is the department's **promo cards** list. Each item is an image followed by a caption link (`<li><img src="https://…" alt=""><a href="…">LOUNGEWEAR</a></li>`). Cards appear in the drawer's right column.
4. **Utility links** – one or more lists of links shown at the bottom of every department menu. The first list follows the menu items, and the last list is pinned to the bottom of the drawer.
5. **Tools** – a paragraph with the language switcher label (e.g. `EN`, `AR`), then a list of site-relative language links (`/en/` English, `/ar/` عربي). The link whose first folder matches the page's language is marked as current (`aria-current`).

A trailing `metadata` section (e.g. `Robots: noindex, nofollow`) is ignored by the block. Relative image paths are resolved against the nav document URL.

The rendered header contains:
1. **Promo strip** (`.nav-promo`)
2. **Main row** (`nav#nav`): brand, hamburger, department tabs (`.nav-tabs`, the tab whose URL matches the current path is active, otherwise the first one), tools (search, account, wishlist, cart, language)
3. **Drawer** (`.nav-drawer`, `role="dialog"`): close button, department tabs (`role="tablist"`), one panel per department with menu groups, utility links, promo cards and drill-down sub-panels

### User Interaction Flows

#### Navigation
1. **Department tabs**: Plain links in the main row. Clicking one goes to the department page.
2. **Drawer**: The hamburger opens a left drawer (50% of the viewport from 900px, full width below that) over a semi-transparent overlay, and page scrolling is locked. The drawer shows the active department. Clicking another tab inside the drawer switches the list (arrow keys also work).
3. **Drill-down**: Items with children open a sub-panel. The back arrow returns to the department list.
4. **Closing**: The close button, a click on the overlay, or Escape closes the drawer. Focus returns to the hamburger.
5. **Focus Management**: Focus moves to the close button on open and is kept inside the drawer while it is open.
6. **Sticky**: The promo strip scrolls away. The main row stays fixed at the top (`position: sticky` on `header`).
7. **Language switcher**: A globe + label + chevron button opens a dropdown with the language links. A click outside or Escape closes it.
8. **Right-to-left**: On `<html dir="rtl">` pages (Arabic) everything mirrors through logical CSS properties:
   - the logo moves to the right and the tools to the left;
   - the drawer opens from the right edge with the mirrored slide-in;
   - the language dropdown aligns to the left;
   - the drill-down back arrow is flipped;
   - in the drawer tabs, the arrow key pointing along the reading direction moves to the next tab.

#### Wishlist
1. Users click wishlist button to navigate to wishlist page
2. Button is always visible in the tools section

#### Mini Cart
1. **Lazy Loading**: Mini cart fragment loads on first interaction or when cart contains items
2. **Cart Counter**: Displays total quantity badge when items are in cart
3. **Panel Toggle**: Click cart button to open/close mini cart panel
4. **Auto-preload**: If cart data exists, mini cart fragment preloads automatically
5. **Analytics**: Publishes shopping cart view event when opened

#### Search
1. **Lazy Loading**: Search functionality loads on first click
2. **Live Search**: Shows results after typing 3 characters with 4 results displayed
3. **Product Links**: Each result links to product detail page
4. **View All**: Footer button links to full search results page
5. **Form Submit**: Enter key navigates to search results page
6. **Panel Close**: Click outside or Escape key closes search panel

#### Authentication
1. **Sign In Flow**: 
   - Unauthenticated users see sign-in form in dropdown
   - Modal option available via `renderAuthCombine`. It only activates if the nav content has an "Account" list item whose last child is the combined-auth trigger (the boilerplate convention). The H&M nav has none, so this is a no-op and the account icon dropdown is the entry point
   - On successful login, page automatically reloads to ensure all components reflect the authenticated state
2. **Sign Out Flow**:
   - Authenticated users see account menu with logout button
   - Logout revokes token asynchronously, then either redirects to a specific page or reloads the current page
   - Special redirects on logout: checkout → cart, customer pages → login, order details → home
   - All other pages simply reload to reflect the logged-out state
3. **User Display**: Dropdown shows "Hi, {firstname}" for authenticated users

#### Seller Assisted Buying Banner
1. **Display Conditions**: Banner appears when user is authenticated and `auth_dropin_admin_session` cookie is present
2. **Session Information**: Displays customer name (bold) and website name from store config
3. **Store Config Caching**: Fetches store config from sessionStorage if available, otherwise calls API and caches result
4. **Close Session**: Button revokes customer token and redirects to home page
5. **Event Handling**: Automatically removes banner when authentication state changes or admin session cookie is cleared
6. **Error Handling**: Gracefully handles JSON parse errors and API failures with console warnings

### State Management

#### Panel Loading States
- Panels use `data-loaded`, `data-loading`, and `data-pending-toggle` attributes
- Loading indicator shows via `aria-busy` attribute on buttons
- Pending toggles queue up during loading and execute after completion

#### Responsive Behavior
- Mobile-first CSS. The mobile layout (below 900px) maps the source's `width < 1024px` rules. The desktop layout starts at 900px, with tighter tab spacing from 900–1199px.
- **Mobile header** (134px, all of it sticky): the 40px promo strip, a 50px row (logo | search, account, wishlist, cart, language | hamburger), and a 44px row of department tabs that scrolls sideways. The tool panels open full width under the icon row.
- **Desktop header** (120px): the 40px strip scrolls away and the 80px row sticks.
- **Mobile drawer**: full screen. It has a header row (logo + close X, where two lines rotate into an X over 0.3s), the department tabs row, then one scrolling column: menu groups (24px gaps), promo cards as a horizontal scroller, then utility links. A drill-down opens a full-screen sub-panel with a back arrow, a centred title and a close X (the sub-panel close button exists only on mobile).
- The drawer slides in with the source animation at every width (`translateX(-50%)` + fade, 0.3s ease-out). Animations are turned off for `prefers-reduced-motion`.
- Crossing the 900px breakpoint (`matchMedia` change) closes the drawer, its sub-panels and the language dropdown.

### Error Handling

- **Fragment Loading**: If nav fragment fails to load, block handles gracefully
- **Metadata Fallbacks**: Uses default paths when metadata is not specified
- **Panel Loading Errors**: Caught in withLoadingState wrapper, sets loading state to false
- **Image Rendering**: Delegates to AEM Assets image rendering with fallback support
- **Search Errors**: Handled by product discovery dropin container
- **Network Failures**: Authentication and cart operations handle network errors through dropins

## Files

- `header.js` - Main block logic: nav loading/parsing, main row, drawer, and tool integrations
- `header.css` - Styles for navigation, panels, and responsive layouts
- `renderAuthCombine.js` - Authentication modal for mobile with sign in/sign up/reset password forms
- `renderAuthDropdown.js` - Authentication dropdown for desktop with sign in form and user menu
- `renderSellerAssistedBuyingBanner.js` - Banner component for seller assisted buying sessions with session management

