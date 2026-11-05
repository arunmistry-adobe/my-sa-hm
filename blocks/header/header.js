// Drop-in Tools
import { events } from '@dropins/tools/event-bus.js';

import { getMetadata, loadSections } from '../../scripts/aem.js';
import { decorateMain, getContentPath, getLocale } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';
import { fetchPlaceholders, rootLink } from '../../scripts/commerce.js';

import renderAuthCombine from './renderAuthCombine.js';
import { renderAuthDropdown } from './renderAuthDropdown.js';
import renderSellerAssistedBuyingBanner from './renderSellerAssistedBuyingBanner.js';
import renderSearchPanel from './search-panel.js';

const labels = await fetchPlaceholders();

const overlay = document.createElement('div');
overlay.classList.add('overlay');
document.querySelector('header').insertAdjacentElement('afterbegin', overlay);

/* -------------------------------------------------------------------------- */
/* Nav content loading                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Rebases relative media URLs so they resolve against the nav document,
 * not against the page that renders the header.
 * @param {Document} doc parsed nav document
 * @param {URL} base URL the nav document was fetched from
 */
function rebaseMedia(doc, base) {
  doc.querySelectorAll('img[src]').forEach((img) => {
    img.setAttribute('src', new URL(img.getAttribute('src'), base).href);
  });
  doc.querySelectorAll('source[srcset]').forEach((source) => {
    const srcset = source.getAttribute('srcset')
      .split(',')
      .map((candidate) => {
        const [url, ...descriptor] = candidate.trim().split(/\s+/);
        return [new URL(url, base).href, ...descriptor].join(' ');
      })
      .join(', ');
    source.setAttribute('srcset', srcset);
  });
}

/**
 * Loads the nav document of the page's language (e.g. /ar/nav.plain.html),
 * falling back to the root one; under /content/ in the local preview.
 * @returns {Promise<HTMLElement|null>} decorated <main> holding the nav sections
 */
async function loadNav() {
  const { prefix } = getLocale();
  let path = getContentPath(`${prefix}/nav.plain.html`);
  let resp = await fetch(path);
  if (!resp.ok && prefix) {
    path = getContentPath('/nav.plain.html');
    resp = await fetch(path);
  }
  if (!resp.ok) return null;

  const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
  rebaseMedia(doc, new URL(path, window.location.href));
  // Defer menu-list images (drawer promo cards) while still inert: once adopted
  // into the page they would start downloading immediately, although they stay
  // hidden until the drawer opens (see loadDeferredImages).
  doc.querySelectorAll('li img[src]').forEach((img) => {
    img.dataset.src = img.getAttribute('src');
    img.removeAttribute('src');
  });
  doc.querySelectorAll('li source[srcset]').forEach((source) => {
    source.dataset.srcset = source.getAttribute('srcset');
    source.removeAttribute('srcset');
  });
  // the trailing metadata section only carries page metadata (robots) – drop it
  doc.querySelectorAll('.metadata').forEach((meta) => {
    const section = meta.closest('body > div');
    (section && section.children.length === 1 ? section : meta).remove();
  });

  const main = document.createElement('main');
  main.append(...doc.body.childNodes);
  decorateMain(main);
  await loadSections(main);
  return main;
}

/**
 * Assigns the authored nav sections to their roles. Order is
 * promo strip, brand, departments, utility links, tools, but every
 * section is optional and detected by its content.
 * @param {Element[]} sections
 */
function classifySections(sections) {
  const depIndex = sections.findIndex((s) => s.querySelector('li > ul, li > ol'));
  const before = depIndex >= 0 ? sections.slice(0, depIndex) : sections;
  const after = depIndex >= 0 ? sections.slice(depIndex + 1) : [];
  const brand = before.find((s) => s.querySelector('img, picture')) || before[before.length - 1];
  const promo = before.find((s) => s !== brand);
  const hasLabel = (s) => [...s.querySelectorAll('p')].some((p) => !p.querySelector('a') && p.textContent.trim());
  const tools = after.find(hasLabel) || after[1];
  const utility = after.find((s) => s !== tools);
  return {
    promo, brand, departments: sections[depIndex], utility, tools,
  };
}

/* -------------------------------------------------------------------------- */
/* Menu parsing                                                               */
/* -------------------------------------------------------------------------- */

const LIST_TAGS = ['UL', 'OL'];

/** true when `el` matches `selector` within `li` itself (not a nested list) */
function hasOwn(li, selector) {
  return [...li.querySelectorAll(selector)].some((el) => el.closest('li') === li);
}

function getOwnLink(li) {
  return [...li.querySelectorAll('a[href]')].find((a) => a.closest('li') === li) || null;
}

function getOwnLabel(li) {
  const link = getOwnLink(li);
  if (link) return link.textContent.trim();
  return [...li.childNodes]
    .filter((n) => !LIST_TAGS.includes(n.nodeName))
    .map((n) => n.textContent)
    .join('')
    .trim();
}

function getChildLists(li) {
  return [...li.children].filter((el) => LIST_TAGS.includes(el.tagName));
}

const isCardList = (list) => !!list.querySelector(':scope > li img, :scope > li picture');

/**
 * Parses a menu item. `<strong>` marks a bold item, `<em>` a red item, each
 * nested list is a group of child items (groups are rendered with a gap).
 */
function parseItem(li) {
  const link = getOwnLink(li);
  return {
    label: getOwnLabel(li),
    href: link ? link.href : '',
    bold: hasOwn(li, 'strong, b'),
    red: hasOwn(li, 'em, i'),
    // eslint-disable-next-line no-use-before-define
    groups: parseGroups(getChildLists(li).filter((list) => !isCardList(list))),
  };
}

function parseGroups(lists) {
  return lists
    .map((list) => [...list.children].filter((el) => el.tagName === 'LI').map(parseItem))
    .filter((group) => group.length);
}

function parseCards(lists) {
  return lists.flatMap((list) => [...list.children].map((li) => {
    const media = li.querySelector('picture') || li.querySelector('img');
    const link = li.querySelector('a[href]');
    return {
      media,
      href: link ? link.href : '',
      caption: (link ? link.textContent : li.textContent).trim(),
    };
  })).filter((card) => card.media || card.caption);
}

function parseDepartments(section) {
  if (!section) return [];
  const list = section.querySelector('ul, ol');
  if (!list) return [];
  return [...list.children].filter((el) => el.tagName === 'LI').map((li) => {
    const link = getOwnLink(li);
    const lists = getChildLists(li);
    return {
      label: getOwnLabel(li),
      href: link ? link.href : '',
      groups: parseGroups(lists.filter((l) => !isCardList(l))),
      cards: parseCards(lists.filter(isCardList)),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Rendering helpers                                                          */
/* -------------------------------------------------------------------------- */

function createElement(tag, className, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function createLink(href, text, className) {
  const a = createElement('a', className);
  if (href) a.href = href;
  a.textContent = text;
  return a;
}

function isCurrentPath(href) {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    const path = url.pathname.replace(/\/$/, '');
    return !!path && window.location.pathname.startsWith(path);
  } catch {
    return false;
  }
}

let panelCounter = 0;

/**
 * Renders groups of menu items. Items with children become drill-down
 * buttons that open a sub-panel appended to `panelHost`.
 */
function renderGroups(groups, panelHost, className) {
  const wrapper = createElement('div', `nav-drawer-groups ${className}`);
  groups.forEach((group) => {
    const ul = createElement('ul', 'nav-drawer-group');
    group.forEach((item) => {
      const li = createElement('li', 'nav-drawer-item');
      li.classList.toggle('is-bold', item.bold);
      li.classList.toggle('is-red', item.red);
      if (item.groups.length) {
        panelCounter += 1;
        const id = `nav-drawer-subpanel-${panelCounter}`;
        const button = createElement('button', 'nav-drawer-link nav-drawer-parent', {
          type: 'button', 'aria-expanded': 'false', 'aria-controls': id,
        });
        button.textContent = item.label;
        // eslint-disable-next-line no-use-before-define
        const subpanel = renderSubpanel(item, id, panelHost, button);
        button.addEventListener('click', () => {
          subpanel.hidden = false;
          button.setAttribute('aria-expanded', 'true');
          subpanel.querySelector('.nav-drawer-back').focus();
        });
        li.append(button);
      } else {
        li.append(createLink(item.href, item.label, 'nav-drawer-link'));
      }
      ul.append(li);
    });
    wrapper.append(ul);
  });
  return wrapper;
}

function renderSubpanel(item, id, panelHost, trigger) {
  const subpanel = createElement('div', 'nav-drawer-subpanel', { id });
  subpanel.hidden = true;
  const back = createElement('button', 'nav-drawer-back', {
    type: 'button',
    'aria-label': labels.Global?.Back ?? 'Back',
  });
  back.addEventListener('click', () => {
    subpanel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  });
  const title = createElement('h2', 'nav-drawer-subpanel-title');
  title.append(item.href ? createLink(item.href, item.label) : item.label);
  // closes the whole drawer (shown in the mobile sub-panel header only)
  const close = createElement('button', 'nav-drawer-subpanel-close', {
    type: 'button',
    'aria-label': labels.Global?.CloseNavigation ?? 'Close navigation',
  });
  const header = createElement('div', 'nav-drawer-subpanel-header');
  header.append(back, title, close);
  subpanel.append(header, renderGroups(item.groups, panelHost, 'nav-drawer-sublist'));
  panelHost.append(subpanel);
  return subpanel;
}

/**
 * Starts downloading images whose sources were deferred until their
 * container is first shown.
 * @param {Element} container
 */
function loadDeferredImages(container) {
  container.querySelectorAll('source[data-srcset]').forEach((source) => {
    source.setAttribute('srcset', source.dataset.srcset);
    delete source.dataset.srcset;
  });
  container.querySelectorAll('img[data-src]').forEach((img) => {
    img.setAttribute('src', img.dataset.src);
    delete img.dataset.src;
  });
}

function renderCards(cards) {
  const ul = createElement('ul', 'nav-drawer-cards');
  cards.forEach(({ media, href, caption }) => {
    const li = createElement('li', 'nav-drawer-card');
    const card = createElement(href ? 'a' : 'div', 'nav-drawer-card-link');
    if (href) card.href = href;
    if (media) {
      const clone = media.cloneNode(true);
      const img = clone.tagName === 'IMG' ? clone : clone.querySelector('img');
      // sources were deferred in loadNav; hidden until the drawer opens
      if (img) {
        img.loading = 'lazy';
        img.setAttribute('fetchpriority', 'low');
      }
      const imageWrapper = createElement('span', 'nav-drawer-card-image');
      imageWrapper.append(clone);
      card.append(imageWrapper);
    }
    if (caption) {
      const span = createElement('span', 'nav-drawer-card-caption');
      span.textContent = caption;
      card.append(span);
    }
    li.append(card);
    ul.append(li);
  });
  return ul;
}

function renderUtility(section) {
  const wrapper = createElement('div', 'nav-drawer-utility');
  if (!section) return wrapper;
  section.querySelectorAll('ul, ol').forEach((list) => {
    const ul = createElement('ul', 'nav-drawer-group');
    list.querySelectorAll('a[href]').forEach((a) => {
      const li = createElement('li', 'nav-drawer-item');
      li.append(createLink(a.href, a.textContent.trim(), 'nav-drawer-link'));
      ul.append(li);
    });
    if (ul.children.length) wrapper.append(ul);
  });
  return wrapper;
}

function renderBrand(section) {
  const brand = createElement('div', 'nav-brand');
  if (!section) return brand;
  const media = section.querySelector('picture') || section.querySelector('img');
  const link = section.querySelector('a[href]');
  const target = link ? createLink(link.href, '', 'nav-brand-link') : createElement('span', 'nav-brand-link');
  if (media) target.append(media);
  else if (link) target.textContent = link.textContent.trim();
  brand.append(target);
  return brand;
}

function renderPromo(section) {
  if (!section) return null;
  const promo = createElement('div', 'nav-promo');
  const content = section.querySelector('.default-content-wrapper') || section;
  [...content.children].forEach((child) => {
    child.removeAttribute('class');
    child.querySelectorAll('a').forEach((a) => { a.className = 'nav-promo-link'; });
    promo.append(child);
  });
  return promo.children.length ? promo : null;
}

/* -------------------------------------------------------------------------- */
/* Block                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // Render a banner at the top of the page if seller assisted buying session identified
  const sellerAssistedBuyingBanner = await renderSellerAssistedBuyingBanner();
  if (sellerAssistedBuyingBanner && !document.querySelector('.seller-assisted-buying-banner')) {
    document.body.insertAdjacentElement('afterbegin', sellerAssistedBuyingBanner);
  }

  // load nav as fragment
  const fragment = await loadNav();
  const sections = fragment ? [...fragment.querySelectorAll(':scope > div')] : [];
  const {
    promo, brand, departments, utility, tools,
  } = classifySections(sections);
  const menu = parseDepartments(departments);
  const activeIndex = Math.max(0, menu.findIndex((dep) => isCurrentPath(dep.href)));

  // decorate nav DOM
  block.textContent = '';
  const navWrapper = createElement('div', 'nav-wrapper');
  const promoStrip = renderPromo(promo);
  if (promoStrip) navWrapper.append(promoStrip);

  const nav = createElement('nav', '', { id: 'nav', 'aria-expanded': 'false' });
  const navBrand = renderBrand(brand);
  nav.append(navBrand);

  /** Hamburger */
  const hamburger = createElement('div', 'nav-hamburger');
  const hamburgerButton = createElement('button', '', {
    type: 'button',
    'aria-controls': 'nav-drawer',
    'aria-expanded': 'false',
    'aria-label': labels.Global?.OpenNavigation ?? 'Open navigation',
  });
  hamburger.append(hamburgerButton);
  nav.append(hamburger);

  /** Department tabs */
  const navSections = createElement('div', 'nav-sections');
  const tabList = createElement('ul', 'nav-tabs');
  menu.forEach((dep, i) => {
    const li = createElement('li', i === activeIndex ? 'active' : '');
    const a = createLink(dep.href, dep.label, 'nav-tab-link');
    if (isCurrentPath(dep.href)) a.setAttribute('aria-current', 'page');
    li.append(a);
    tabList.append(li);
  });
  navSections.append(tabList);
  nav.append(navSections);

  const navTools = createElement('div', 'nav-tools');
  nav.append(navTools);

  /** Search: panel sliding in from the inline end, results page of the page's language */
  const search = renderSearchPanel(navTools, {
    labels,
    searchPath: getContentPath(`/${getLocale().lang}/search`),
    overlay,
  });

  /** Account (auth dropdown) */
  renderAuthDropdown(navTools, labels);

  /** Wishlist */
  const wishlist = document.createRange().createContextualFragment(`
     <div class="wishlist-wrapper nav-tools-wrapper">
       <button type="button" class="nav-wishlist-button" aria-label="${labels.Global?.Wishlist ?? 'Wishlist'}"></button>
       <div class="wishlist-panel nav-tools-panel"></div>
     </div>
   `);

  navTools.append(wishlist);

  const wishlistButton = navTools.querySelector('.nav-wishlist-button');

  const wishlistMeta = getMetadata('wishlist');
  const wishlistPath = wishlistMeta ? new URL(wishlistMeta, window.location).pathname : '/wishlist';

  wishlistButton.addEventListener('click', () => {
    window.location.href = rootLink(wishlistPath);
  });

  /** Mini Cart */
  const excludeMiniCartFromPaths = ['/checkout'];

  const minicart = document.createRange().createContextualFragment(`
     <div class="minicart-wrapper nav-tools-wrapper">
       <button type="button" class="nav-cart-button" aria-label="${labels.Global?.Cart ?? 'Cart'}" aria-haspopup="dialog" aria-expanded="false" aria-controls="minicart-panel"></button>
       <div class="minicart-panel nav-tools-panel" id="minicart-panel"></div>
       <div class="nav-cart-status" role="status" aria-live="polite"></div>
     </div>
   `);

  navTools.append(minicart);

  const minicartPanel = navTools.querySelector('.minicart-panel');

  const cartButton = navTools.querySelector('.nav-cart-button');

  // Kept mounted at all times so the item count change is reliably
  // announced instead of being missed, since the visual badge is a
  // `data-count` attribute rendered via CSS and isn't announced on its own.
  const cartStatus = navTools.querySelector('.nav-cart-status');

  if (excludeMiniCartFromPaths.includes(window.location.pathname)) {
    cartButton.style.display = 'none';
  }

  /**
   * Handles loading states for navigation panels with state management
   *
   * @param {HTMLElement} panel - The panel element to manage loading state for
   * @param {HTMLElement} button - The button that triggers the panel
   * @param {Function} loader - Async function to execute during loading
   */
  async function withLoadingState(panel, button, loader) {
    if (panel.dataset.loaded === 'true' || panel.dataset.loading === 'true') return;

    button.setAttribute('aria-busy', 'true');
    panel.dataset.loading = 'true';

    try {
      await loader();
      panel.dataset.loaded = 'true';
    } finally {
      panel.dataset.loading = 'false';
      button.removeAttribute('aria-busy');

      // Execute pending toggle if exists
      if (panel.dataset.pendingToggle === 'true') {
        // eslint-disable-next-line no-nested-ternary
        const pendingState = panel.dataset.pendingState === 'true' ? true : (panel.dataset.pendingState === 'false' ? false : undefined);

        // Clear pending flags
        panel.removeAttribute('data-pending-toggle');
        panel.removeAttribute('data-pending-state');

        // Execute the pending toggle
        const show = pendingState ?? !panel.classList.contains('nav-tools-panel--show');
        panel.classList.toggle('nav-tools-panel--show', show);
      }
    }
  }

  function togglePanel(panel, state) {
    // If loading is in progress, queue the toggle action
    if (panel.dataset.loading === 'true') {
      // Store the pending toggle action
      panel.dataset.pendingToggle = 'true';
      panel.dataset.pendingState = state !== undefined ? state.toString() : '';
      return;
    }

    const show = state ?? !panel.classList.contains('nav-tools-panel--show');
    panel.classList.toggle('nav-tools-panel--show', show);
  }

  // Lazy loading for mini cart fragment
  async function loadMiniCartFragment() {
    await withLoadingState(minicartPanel, cartButton, async () => {
      const miniCartMeta = getMetadata('mini-cart');
      const miniCartPath = miniCartMeta ? new URL(miniCartMeta, window.location).pathname : '/mini-cart';
      const miniCartFragment = await loadFragment(miniCartPath);
      minicartPanel.append(miniCartFragment.firstElementChild);
    });
  }

  async function toggleMiniCart(state) {
    if (state) {
      await loadMiniCartFragment();
      const { publishShoppingCartViewEvent } = await import('@dropins/storefront-cart/api.js');
      publishShoppingCartViewEvent();
    }

    togglePanel(minicartPanel, state);
    cartButton.setAttribute(
      'aria-expanded',
      minicartPanel.classList.contains('nav-tools-panel--show') ? 'true' : 'false',
    );
  }

  cartButton.addEventListener('click', () => toggleMiniCart(!minicartPanel.classList.contains('nav-tools-panel--show')));

  // Cart Item Counter
  let previousCartQuantity;

  events.on('cart/data', (data) => {
    const totalQuantity = data?.totalQuantity ?? 0;

    if (totalQuantity) {
      cartButton.setAttribute('data-count', totalQuantity);
    } else {
      cartButton.removeAttribute('data-count');
    }

    cartButton.setAttribute(
      'aria-label',
      totalQuantity === 1
        ? (labels.Global?.CartWithItem?.replace('{count}', totalQuantity)
          ?? `Cart with ${totalQuantity} item`)
        : (labels.Global?.CartWithItems?.replace('{count}', totalQuantity)
          ?? `Cart with ${totalQuantity} items`),
    );

    // Skip the announcement for the initial value on page load so screen
    // reader users aren't told about the cart contents before they've
    // interacted with it; only announce actual changes.
    if (previousCartQuantity !== undefined && previousCartQuantity !== totalQuantity) {
      if (totalQuantity) {
        cartStatus.textContent = totalQuantity === 1
          ? (labels.Global?.CartUpdatedWithItem?.replace('{count}', totalQuantity)
            ?? `Cart updated, ${totalQuantity} item in cart`)
          : (labels.Global?.CartUpdatedWithItems?.replace('{count}', totalQuantity)
            ?? `Cart updated, ${totalQuantity} items in cart`);
      } else {
        cartStatus.textContent = labels.Global?.CartUpdatedEmpty ?? 'Cart updated, cart is empty';
      }
    }

    previousCartQuantity = totalQuantity;
  }, { eager: true });

  /** Search behaviour */
  const searchPanel = search.panel;
  const searchButton = search.wrapper.querySelector('.nav-search-button');
  const toggleSearch = (state) => {
    if (state) {
      toggleMiniCart(false);
      toggleLanguage(false);
    }
    search.toggle(state);
  };
  searchButton.addEventListener('click', () => toggleSearch(true));

  /** Language switcher */
  const languageLinks = tools ? [...tools.querySelectorAll('a[href]')] : [];
  let languageButton;
  let languageOptions;
  const toggleLanguage = (state) => {
    if (!languageButton) return;
    const show = state ?? languageOptions.hidden;
    languageOptions.hidden = !show;
    languageButton.setAttribute('aria-expanded', show ? 'true' : 'false');
  };
  if (languageLinks.length) {
    const labelEl = [...tools.querySelectorAll('p')].find((p) => !p.querySelector('a') && p.textContent.trim());
    const language = createElement('div', 'nav-language nav-tools-wrapper');
    languageButton = createElement('button', 'nav-language-button', {
      type: 'button',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-controls': 'nav-language-options',
    });
    const languageLabel = createElement('span', 'nav-language-label');
    languageLabel.textContent = (labelEl || languageLinks[0]).textContent.trim();
    // accessible name must start with the visible text ("EN")
    languageButton.setAttribute('aria-label', `${languageLabel.textContent}, ${labels.Global?.Language ?? 'Language'}`);
    languageButton.append(languageLabel);
    languageOptions = createElement('ul', 'nav-language-options', { id: 'nav-language-options' });
    languageOptions.hidden = true;
    // the current language's link is the one into its folder (/en/…, /ar/…)
    const { lang } = getLocale();
    const isCurrentLanguage = (a) => {
      const [, folder] = new URL(a.href).pathname.replace(/^\/content(?=\/)/, '').split('/');
      return folder === lang;
    };
    languageLinks.forEach((a) => {
      const li = createElement('li', 'nav-language-option');
      const link = createLink(a.href, a.textContent.trim(), 'nav-language-link');
      if (isCurrentLanguage(a)) {
        li.classList.add('active');
        link.setAttribute('aria-current', 'true');
      }
      li.append(link);
      languageOptions.append(li);
    });
    languageButton.addEventListener('click', () => toggleLanguage());
    language.append(languageButton, languageOptions);
    navTools.append(language);
  }

  // Close panels when clicking outside
  document.addEventListener('click', (e) => {
    // Check if undo is enabled for mini cart
    const miniCartElement = document.querySelector(
      '[data-block-name="commerce-mini-cart"]',
    );
    const undoEnabled = miniCartElement
      && (miniCartElement.textContent?.includes('undo-remove-item')
        || miniCartElement.innerHTML?.includes('undo-remove-item'));

    // For mini cart: if undo is enabled, be more restrictive about when to close
    const shouldCloseMiniCart = undoEnabled
      ? !minicartPanel.contains(e.target)
      && !cartButton.contains(e.target)
      && !e.target.closest('header')
      : !minicartPanel.contains(e.target) && !cartButton.contains(e.target);

    if (shouldCloseMiniCart) {
      toggleMiniCart(false);
    }

    if (!searchPanel.contains(e.target) && !searchButton.contains(e.target)) {
      toggleSearch(false);
    }

    if (languageButton && !languageButton.parentElement.contains(e.target)) {
      toggleLanguage(false);
    }
  });

  /** Drawer (hamburger menu) */
  const drawer = createElement('div', 'nav-drawer', {
    id: 'nav-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': labels.Global?.Navigation ?? 'Navigation',
  });
  drawer.hidden = true;

  const drawerHeader = createElement('div', 'nav-drawer-header');
  const closeButton = createElement('button', 'nav-drawer-close', {
    type: 'button',
    'aria-label': labels.Global?.CloseNavigation ?? 'Close navigation',
  });
  const drawerTabs = createElement('ul', 'nav-drawer-tabs', { role: 'tablist' });
  // the mobile drawer header repeats the logo
  const drawerBrand = navBrand.cloneNode(true);
  drawerBrand.className = 'nav-drawer-brand';
  drawerHeader.append(drawerBrand, closeButton, drawerTabs);

  const drawerBody = createElement('div', 'nav-drawer-body');
  const tabs = [];
  const panels = [];
  menu.forEach((dep, i) => {
    const tabId = `nav-drawer-tab-${i}`;
    const panelId = `nav-drawer-panel-${i}`;
    const li = createElement('li', '', { role: 'presentation' });
    const tab = createElement('button', 'nav-drawer-tab', {
      type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': 'false',
    });
    tab.textContent = dep.label;
    li.append(tab);
    drawerTabs.append(li);
    tabs.push(tab);

    const panel = createElement('div', 'nav-drawer-panel', {
      id: panelId, role: 'tabpanel', 'aria-labelledby': tabId,
    });
    panel.hidden = true;
    const column = createElement('div', 'nav-drawer-menu');
    column.append(renderGroups(dep.groups, panel, 'nav-drawer-list'), renderUtility(utility));
    panel.append(column);
    if (dep.cards.length) panel.append(renderCards(dep.cards));
    drawerBody.append(panel);
    panels.push(panel);
  });
  drawer.append(drawerHeader, drawerBody);

  function closeSubpanels() {
    drawer.querySelectorAll('.nav-drawer-subpanel').forEach((sub) => { sub.hidden = true; });
    drawer.querySelectorAll('.nav-drawer-parent').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  }

  function selectDepartment(index) {
    closeSubpanels();
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectDepartment(i));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      // the arrow pointing along the reading direction moves to the next tab
      const forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const next = (i + (e.key === forward ? 1 : -1) + tabs.length) % tabs.length;
      selectDepartment(next);
      tabs[next].focus();
    });
  });

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusables = [...drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
      .filter((el) => el.getClientRects().length);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function toggleDrawer(open) {
    const show = open ?? drawer.hidden;
    if (show === !drawer.hidden) return;
    drawer.hidden = !show;
    nav.setAttribute('aria-expanded', show ? 'true' : 'false');
    hamburgerButton.setAttribute('aria-expanded', show ? 'true' : 'false');
    hamburgerButton.setAttribute(
      'aria-label',
      show ? (labels.Global?.CloseNavigation ?? 'Close navigation') : (labels.Global?.OpenNavigation ?? 'Open navigation'),
    );
    overlay.classList.toggle('show', show);
    document.body.style.overflowY = show ? 'hidden' : '';
    if (show) {
      loadDeferredImages(drawer);
      toggleSearch(false);
      toggleMiniCart(false);
      toggleLanguage(false);
      selectDepartment(Math.min(activeIndex, panels.length - 1));
      drawer.addEventListener('keydown', trapFocus);
      closeButton.focus();
    } else {
      closeSubpanels();
      drawer.removeEventListener('keydown', trapFocus);
      if (drawer.contains(document.activeElement) || document.activeElement === document.body) {
        hamburgerButton.focus();
      }
    }
  }

  hamburgerButton.addEventListener('click', () => toggleDrawer(true));
  closeButton.addEventListener('click', () => toggleDrawer(false));
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('.nav-drawer-subpanel-close')) toggleDrawer(false);
  });
  overlay.addEventListener('click', () => toggleDrawer(false));

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (!drawer.hidden) {
      toggleDrawer(false);
    } else if (!searchPanel.hidden) {
      toggleSearch(false);
    } else if (languageOptions && !languageOptions.hidden) {
      toggleLanguage(false);
      languageButton.focus();
    }
  });

  // crossing the desktop breakpoint resets the menu state
  window.matchMedia('(min-width: 900px)').addEventListener('change', () => {
    toggleDrawer(false);
    closeSubpanels();
    toggleLanguage(false);
  });

  navWrapper.append(nav, drawer);
  block.append(navWrapper);

  renderAuthCombine(drawer, () => toggleDrawer(false));
}
