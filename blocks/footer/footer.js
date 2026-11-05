import { getRootPath, isMultistore } from '@dropins/tools/lib/aem/configs.js';
// Dropin Components
import {
  Button,
  provider as UI,
} from '@dropins/tools/components.js';

// Block-level
import createModal from '../modal/modal.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadSections } from '../../scripts/aem.js';
import { decorateMain, getContentPath } from '../../scripts/scripts.js';

const DESKTOP_MEDIA = window.matchMedia('(min-width: 900px)');

let uid = 0;
function nextId(prefix) {
  uid += 1;
  return `${prefix}-${uid}`;
}

/**
 * Toggles all storeSelector sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleStoreDropdown(sections, expanded = false) {
  sections
    .querySelectorAll('.storeview-modal .default-content-wrapper > ul > li')
    .forEach((section) => {
      section.setAttribute('aria-expanded', expanded);
    });
}

/**
 * Fetches the first available fragment from a list of paths.
 * @param {string[]} paths candidate paths
 * @returns {Promise<{html: string, url: URL}|null>}
 */
async function fetchFirstAvailable(paths) {
  // eslint-disable-next-line no-restricted-syntax
  for (const path of paths) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(path);
      if (resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        const html = await resp.text();
        return { html, url: new URL(path, window.location.href) };
      }
    } catch (e) {
      // try next candidate
    }
  }
  return null;
}

/**
 * Resolves relative media references against the fragment location
 * (so that "images/x.svg" works regardless of the current page path).
 * @param {Element} container parsed fragment content
 * @param {URL} baseUrl location of the fragment
 */
function resolveMediaPaths(container, baseUrl) {
  const isRelative = (value) => value && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(value);
  container.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (isRelative(src)) img.setAttribute('src', new URL(src, baseUrl).href);
  });
  container.querySelectorAll('source[srcset]').forEach((source) => {
    const srcset = source.getAttribute('srcset');
    if (isRelative(srcset)) source.setAttribute('srcset', new URL(srcset, baseUrl).href);
  });
}

/**
 * Loads and decorates the footer fragment content.
 * @returns {Promise<HTMLElement|null>} decorated main element
 */
async function loadContentFragment() {
  // under /content/ in the local preview, at the root on published sites
  const result = await fetchFirstAvailable([getContentPath('/footer.plain.html')]);
  if (!result) return null;
  // parse in an inert document so relative images are not requested from the page path
  const doc = new DOMParser().parseFromString(result.html, 'text/html');
  resolveMediaPaths(doc.body, result.url);
  const main = document.createElement('main');
  main.append(...doc.body.childNodes);
  decorateMain(main);
  await loadSections(main);
  return main;
}

/**
 * Removes auto-button decoration from links inside the footer.
 * @param {Element} root container
 */
function removeButtonDecoration(root) {
  root.querySelectorAll('a.button').forEach((a) => {
    a.classList.remove('button', 'primary', 'secondary', 'accent');
    a.closest('.button-wrapper, .button-container')?.classList.remove('button-wrapper', 'button-container');
  });
}

/**
 * Splits a container's children into groups that each start with a heading.
 * @param {Element} container
 * @returns {{heading: Element, items: Element[]}[]}
 */
function groupByHeading(container) {
  const groups = [];
  [...container.children].forEach((el) => {
    if (/^H[2-6]$/.test(el.tagName)) {
      groups.push({ heading: el, items: [] });
    } else if (groups.length) {
      groups[groups.length - 1].items.push(el);
    }
  });
  return groups;
}

/**
 * Expands one accordion column and collapses the others (mobile only).
 * @param {Element} wrapper columns container
 * @param {Element} target toggle button to switch
 */
function toggleColumn(wrapper, target) {
  const willExpand = target.getAttribute('aria-expanded') !== 'true';
  wrapper.querySelectorAll('.footer-column-toggle').forEach((btn) => {
    btn.setAttribute('aria-expanded', btn === target && willExpand ? 'true' : 'false');
  });
}

/**
 * Builds a link column with an accordion toggle for small screens.
 */
function buildLinkColumn(group, wrapper) {
  const column = document.createElement('div');
  column.className = 'footer-column';

  const heading = group.heading.cloneNode(false);
  heading.className = 'footer-column-heading';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'footer-column-toggle';
  toggle.textContent = group.heading.textContent.trim();
  toggle.setAttribute('aria-expanded', 'false');
  heading.append(toggle);
  column.append(heading);

  const list = group.items.find((el) => el.tagName === 'UL');
  const listId = nextId('footer-column-list');
  list.id = listId;
  list.className = 'footer-column-list';
  toggle.setAttribute('aria-controls', listId);
  column.append(...group.items);

  toggle.addEventListener('click', () => {
    if (DESKTOP_MEDIA.matches) return;
    toggleColumn(wrapper, toggle);
  });
  return column;
}

/**
 * Builds the newsletter column (email field + submit button) from authored text.
 * The first plain paragraph is the field placeholder, the link text is the button label.
 */
function buildNewsletterColumn(group) {
  const column = document.createElement('div');
  column.className = 'footer-column footer-newsletter';

  const title = document.createElement('p');
  title.className = 'footer-newsletter-title';
  title.textContent = group.heading.textContent.trim();
  column.append(title);

  const textParagraph = group.items.find((el) => el.tagName === 'P' && !el.querySelector('a'));
  const link = group.items.map((el) => el.querySelector('a')).find(Boolean);
  const placeholder = textParagraph?.textContent.trim() || '';
  const label = link?.textContent.trim() || '';

  const form = document.createElement('form');
  form.className = 'footer-newsletter-form';
  form.noValidate = true;
  if (link) form.action = link.href;

  const inputId = nextId('footer-newsletter-email');
  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'footer-visually-hidden';
  fieldLabel.htmlFor = inputId;
  fieldLabel.textContent = placeholder;

  const input = document.createElement('input');
  input.type = 'email';
  input.id = inputId;
  input.name = 'email';
  input.required = true;
  input.autocomplete = 'email';
  input.placeholder = placeholder;

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'footer-newsletter-submit';
  button.textContent = label;

  form.append(fieldLabel, input, button);
  form.addEventListener('submit', (e) => {
    // No newsletter backend is connected yet: validate locally, never navigate.
    e.preventDefault();
    if (!input.checkValidity()) input.reportValidity();
  });

  column.append(form);
  return column;
}

/**
 * Decorates the link columns section.
 * @param {Element} section footer section containing headings + lists
 */
function decorateColumns(section) {
  section.classList.add('footer-columns');
  const content = section.querySelector('.default-content-wrapper') || section;
  const wrapper = document.createElement('div');
  wrapper.className = 'footer-columns-wrapper';

  groupByHeading(content).forEach((group) => {
    const hasList = group.items.some((el) => el.tagName === 'UL');
    wrapper.append(hasList ? buildLinkColumn(group, wrapper) : buildNewsletterColumn(group));
  });

  // first column expanded by default on small screens
  wrapper.querySelector('.footer-column-toggle')?.setAttribute('aria-expanded', 'true');
  content.replaceChildren(wrapper);
}

/**
 * Decorates the customer service / logo / country section.
 * @param {Element} section
 */
function decorateInfo(section) {
  section.classList.add('footer-info');
  section.querySelectorAll('p').forEach((p) => {
    const text = p.textContent.trim();
    const links = p.querySelectorAll('a');
    if (p.querySelector('img, picture') && !text) {
      p.classList.add('footer-logo');
    } else if (p.querySelector('strong')) {
      p.classList.add('footer-country');
    } else if (links.length === 1 && links[0].textContent.trim() === text) {
      p.classList.add('footer-service');
    } else {
      p.classList.add('footer-hours');
    }
  });
}

/**
 * Decorates the legal / social icons section.
 * @param {Element} section
 */
function decorateLegal(section) {
  section.classList.add('footer-legal');
  const content = section.querySelector('.default-content-wrapper') || section;
  const text = document.createElement('div');
  text.className = 'footer-legal-text';
  [...content.children].forEach((el) => {
    const isSocial = el.querySelector('a img, a picture') && !el.textContent.trim();
    if (isSocial) {
      el.classList.add('footer-social');
      el.querySelectorAll('a').forEach((a) => {
        a.target = '_blank';
        a.rel = 'noopener';
        const alt = a.querySelector('img')?.alt;
        if (alt && !a.getAttribute('aria-label')) a.setAttribute('aria-label', alt);
      });
      // drop whitespace text nodes between icons
      [...el.childNodes].forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) node.remove();
      });
    } else {
      text.append(el);
    }
  });
  content.prepend(text);
}

/**
 * Creates the floating back-to-top button.
 * @returns {HTMLButtonElement}
 */
function buildBackToTop() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'footer-back-to-top';
  button.setAttribute('aria-label', 'Back to top');
  button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 13.5V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  const update = () => button.classList.toggle('is-visible', window.scrollY > 300);
  window.addEventListener('scroll', update, { passive: true });
  update();
  return button;
}

/**
 * Applies the footer-specific structure to the loaded fragment sections.
 * @param {Element} footer footer container
 */
function decorateFooterContent(footer) {
  removeButtonDecoration(footer);
  const sections = [...footer.querySelectorAll(':scope > .section')];
  const columnsIndex = sections.findIndex((s) => s.querySelector('h2, h3, h4') && s.querySelector('ul'));
  if (columnsIndex >= 0) decorateColumns(sections[columnsIndex]);
  const rest = sections.filter((s, i) => i !== columnsIndex && s.textContent.trim());
  if (rest[0]) decorateInfo(rest[0]);
  if (rest[1]) decorateLegal(rest[1]);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const root = getRootPath();
  // Load Footer as Fragment
  const fragment = await loadContentFragment();

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');

  // Footer content - Store Switcher
  if (isMultistore()) {
    footer.innerHTML = `
      <div class="storeview-switcher-button"></div>
    `;

    // Container and component refs
    let modal;

    // Modal Actions
    const showModal = async (content) => {
      modal = await createModal([content]);
      modal.showModal();
    };

    // Rendering the Store Switcher Modal Content
    const $storeSwitcherBtn = footer.querySelector(
      '.storeview-switcher-button',
    );

    // Store Switcher Modal Content
    const storeSwitcherPath = '/store-switcher';
    let fragmentStoreView;

    try {
      fragmentStoreView = await loadFragment(storeSwitcherPath);
      if (!fragmentStoreView) throw new Error(`Footer does not render due to Store Switcher fragment (${storeSwitcherPath}) not found`);
    } catch (error) {
      console.error('Error loading store switcher fragment:', error);
      return;
    }

    // Store Switcher Modal Content
    const storeSwitcher = document.createElement('div');

    // Return Storename from stores-switcher
    const selected = [...fragmentStoreView.querySelectorAll('a')].find((a) => {
      const url = new URL(a.href);
      return url.pathname.startsWith(root);
    });

    storeSwitcher.id = 'storeview-modal';
    while (fragmentStoreView.firstElementChild) {
      storeSwitcher.append(fragmentStoreView.firstElementChild);
    }

    // create classes for storeview modal sections
    const classes = ['storeview-title', 'storeview-list'];
    classes.forEach((c, i) => {
      const section = storeSwitcher.children[i];
      if (section) section.classList.add(`storeview-modal-${c}`);
    });

    // Store Switcher Modal Content - Store View Title
    const storeViewTitle = storeSwitcher.querySelector('.storeview-modal-storeview-title');
    const title = storeViewTitle.querySelector('h3');
    if (title) {
      title.className = '';
      title.closest('h3').classList.add('storeview-modal-storeview-title');
      title.setAttribute('tabindex', '0');
    }

    // Storeview List
    const storeViewList = storeSwitcher.querySelector('.storeview-modal-storeview-list');

    if (storeViewList && storeViewList.children.length) {
      // Add storeview-selection class to parent UL
      storeViewList
        .querySelectorAll(':scope .default-content-wrapper > ul')
        .forEach((storeView) => {
          if (storeView.querySelector('ul')) storeView.classList.add('storeview-selection');
        });

      // if multiple stores exist per region, add class storeviews and click events for accordion
      storeViewList.querySelectorAll('.default-content-wrapper > ul > li > ul').forEach((storeRegion) => {
        if (storeRegion.children.length > 1) {
          if (storeRegion.querySelector('ul')) storeRegion.classList.add('storeviews');

          // Accessiblity: addeventlistener for 'click' and keyboard event and tab indexes
          storeViewList.querySelectorAll(':scope li').forEach((storeView) => {
            const link = storeView.closest('a');
            if (link) link.setAttribute('tabindex', '0');
            storeView.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                const expanded = storeView.getAttribute('aria-expanded') === 'true';
                toggleStoreDropdown(storeViewList);
                storeView.setAttribute('aria-expanded', expanded ? 'false' : 'true');
              }
            });
            storeView.addEventListener('click', () => {
              const expanded = storeView.getAttribute('aria-expanded') === 'true';
              toggleStoreDropdown(storeViewList);
              storeView.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            });
          });
        }
      });

      // If only one storeview link in region, convert parent UL into the li and remove the child UL
      storeViewList.querySelectorAll('.default-content-wrapper > ul > li > ul').forEach((storeRegion) => {
        const li = storeRegion.closest('li');

        if (storeRegion.children.length <= 1) {
          li.classList.add('storeview-single-store');
          const ulParent = li.closest('ul');
          const replacedChild = (storeRegion.firstElementChild);
          replacedChild.className = 'storeview-single-store';

          ulParent.replaceChild(replacedChild, li);
          ulParent.setAttribute('tabindex', '0');
        } else {
          li.classList.add('storeview-multiple-stores');
          li.setAttribute('tabindex', '0');
        }
      });

      UI.render(Button, {
        children: `${selected.text}`,
        'data-testid': 'storeview-switcher-button',
        className: 'storeview-switcher-button',
        size: 'medium',
        variant: 'teritary',
        onClick: () => {
          showModal(storeSwitcher);
        },
      })($storeSwitcherBtn);
    }
  }

  if (fragment) {
    while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
    decorateFooterContent(footer);
  }

  footer.append(buildBackToTop());
  block.append(footer);
}
