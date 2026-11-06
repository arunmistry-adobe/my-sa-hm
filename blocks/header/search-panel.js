// Keyword search panel, laid out like the source site's: a full-height panel that slides in from
// the inline end. On open it shows trending products; from 3 typed characters it shows the
// catalog's type-ahead suggestions beside the matching products.
import { tryGenerateAemAssetsOptimizedUrl } from '@dropins/tools/lib/aem/assets.js';
import { CS_FETCH_GRAPHQL, getProductLink } from '../../scripts/commerce.js';

const MIN_CHARS = 3;
const PRODUCT_COUNT = 4;
const IMAGE_SIZE = { width: 400, height: 600 };

// fields shared by the trending queries (catalog ProductView)
const PRODUCT_FIELDS = `name sku urlKey images(roles: ["image", "small_image"]) { url label }
  ... on SimpleProductView { price { final { amount { value currency } } } }
  ... on ComplexProductView { priceRange { minimum { final { amount { value currency } } } } }`;

function createElement(tag, className, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

/** Splits a label like 'Results for "{phrase}"' around its placeholder, keeping the phrase as text. */
function fillLabel(label, values) {
  return label.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    if (!key || !(key in values)) return part;
    const strong = createElement('strong');
    strong.textContent = values[key];
    return strong;
  });
}

/** The suggestion with the typed text in bold (text nodes only, never HTML). */
function highlight(text, phrase) {
  const nodes = [];
  const lower = text.toLowerCase();
  const term = phrase.toLowerCase();
  let from = 0;
  let at = term ? lower.indexOf(term) : -1;
  while (at !== -1) {
    if (at > from) nodes.push(text.slice(from, at));
    const b = createElement('b');
    b.textContent = text.slice(at, at + term.length);
    nodes.push(b);
    from = at + term.length;
    at = lower.indexOf(term, from);
  }
  if (from < text.length) nodes.push(text.slice(from));
  return nodes;
}

function formatPrice(amount) {
  if (!amount?.currency) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: amount.currency }).format(amount.value);
}

function renderProduct(product) {
  const li = createElement('li', 'nav-search-product');
  const link = createElement('a', 'nav-search-product-link', { href: getProductLink(product.urlKey, product.sku) });
  const media = createElement('span', 'nav-search-product-image');
  const image = product.images?.[0];
  if (image?.url) {
    media.append(createElement('img', '', {
      src: tryGenerateAemAssetsOptimizedUrl(image.url, product.sku, IMAGE_SIZE),
      alt: '',
      width: IMAGE_SIZE.width,
      height: IMAGE_SIZE.height,
    }));
  }
  const name = createElement('span', 'nav-search-product-name');
  name.textContent = product.name;
  link.append(media, name);
  const price = formatPrice(product.price?.final?.amount ?? product.priceRange?.minimum?.final?.amount);
  if (price) {
    const priceEl = createElement('span', 'nav-search-product-price');
    priceEl.textContent = price;
    link.append(priceEl);
  }
  li.append(link);
  return li;
}

// Home page recommendation types the panel uses, in order of preference
const TRENDING_TYPES = ['trending', 'mostviewed'];

/**
 * Products of the Home page "Trending" recommendation unit (or "Most viewed" when there is no
 * Trending one), or the first catalog products while neither is set up in Commerce.
 */
async function fetchTrendingProducts() {
  try {
    const { data } = await CS_FETCH_GRAPHQL.fetchGraphQl(
      `query { recommendations(pageType: CMS) { results { typeId productsView { ${PRODUCT_FIELDS} } } } }`,
    );
    // type ids are compared without case or separators (most-viewed, most_viewed, ...)
    const typeOf = (u) => String(u.typeId || '').toLowerCase().replace(/[^a-z]/g, '');
    const units = (data?.recommendations?.results || []).filter((u) => u.productsView?.length);
    const unit = TRENDING_TYPES.map((type) => units.find((u) => typeOf(u) === type)).find(Boolean);
    if (unit) return unit.productsView.slice(0, PRODUCT_COUNT);
  } catch (e) {
    // recommendations unavailable: fall back to the catalog
  }
  try {
    const { data } = await CS_FETCH_GRAPHQL.fetchGraphQl(
      `query trending($size: Int) { productSearch(phrase: "", page_size: $size) { items { productView { ${PRODUCT_FIELDS} } } } }`,
      { variables: { size: PRODUCT_COUNT } },
    );
    return (data?.productSearch?.items || []).map((item) => item.productView).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/** Type-ahead search terms; the search drop-in doesn't request them. */
async function fetchSuggestions(phrase) {
  try {
    const { data } = await CS_FETCH_GRAPHQL.fetchGraphQl(
      'query suggest($phrase: String!) { productSearch(phrase: $phrase, page_size: 1) { suggestions } }',
      { variables: { phrase } },
    );
    return data?.productSearch?.suggestions || [];
  } catch (e) {
    return [];
  }
}

/**
 * Builds the search button and panel into the header tools.
 * @param {HTMLElement} navTools header tools container
 * @param {object} options
 * @param {object} options.labels placeholders (Global.*)
 * @param {string} options.searchPath search results page of the page's language
 * @param {HTMLElement} options.overlay page dimmer shared with the menu drawer
 * @returns {{ toggle: Function, wrapper: HTMLElement }}
 */
export default function renderSearchPanel(navTools, { labels, searchPath, overlay }) {
  const g = labels.Global || {};
  const text = {
    search: g.Search ?? 'Search',
    close: g.CloseSearch ?? 'Close search',
    suggestions: g.SearchSuggestions ?? 'Suggestions',
    trendingSearches: g.SearchTrendingSearches ?? 'Trending Searches',
    trending: g.SearchTrendingProducts ?? 'Trending products',
    resultsFor: g.SearchResultsFor ?? 'Results for "{phrase}"',
    noResults: g.SearchNoResults ?? 'No results found for "{phrase}"',
    viewAll: g.SearchViewAll ?? 'View All',
  };
  // authored in the placeholders sheet: terms separated by commas or line breaks
  const trendingTerms = String(g.SearchTrendingTerms || '').split(/[,\n]/)
    .map((term) => term.trim()).filter(Boolean).slice(0, 10);

  const wrapper = createElement('div', 'search-wrapper nav-tools-wrapper');
  const button = createElement('button', 'nav-search-button', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'search-panel',
  });
  button.textContent = text.search;

  const panel = createElement('div', 'nav-search-panel', {
    id: 'search-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': text.search,
  });
  panel.hidden = true;

  const bar = createElement('div', 'nav-search-bar');
  const form = createElement('form', '', { id: 'search-bar-form', role: 'search', action: searchPath });
  const input = createElement('input', 'nav-search-field', {
    type: 'search', name: 'q', placeholder: text.search, 'aria-label': text.search, autocomplete: 'off', enterkeyhint: 'search',
  });
  form.append(input);
  const close = createElement('button', 'nav-search-close', { type: 'button', 'aria-label': text.close });
  bar.append(form, close);

  const body = createElement('div', 'nav-search-body');
  const terms = createElement('div', 'nav-search-terms');
  terms.hidden = true;
  const termsHeading = createElement('h2', 'nav-search-heading');
  const termList = createElement('ul', 'nav-search-term-list');
  terms.append(termsHeading, termList);

  const products = createElement('div', 'nav-search-products', { 'aria-live': 'polite' });
  const productsHeader = createElement('div', 'nav-search-products-header');
  const productsHeading = createElement('h2', 'nav-search-heading');
  const viewAll = createElement('a', 'nav-search-view-all', { href: searchPath });
  viewAll.textContent = text.viewAll;
  productsHeader.append(productsHeading, viewAll);
  const grid = createElement('ul', 'nav-search-product-grid');
  products.append(productsHeader, grid);

  body.append(terms, products);
  panel.append(bar, body);
  wrapper.append(button, panel);
  navTools.append(wrapper);

  let trending;
  let request = 0;
  let debounceTimer;
  let searchApi;

  const resultsUrl = (phrase) => `${searchPath}?q=${encodeURIComponent(phrase)}`;

  function showProducts(heading, items, href) {
    productsHeading.replaceChildren(...heading);
    viewAll.href = href;
    grid.replaceChildren(...items.map(renderProduct));
    products.hidden = !items.length;
  }

  function showTermList(heading, list, phrase = '') {
    termsHeading.replaceChildren(...heading);
    termList.replaceChildren(...list.map((term) => {
      const li = createElement('li', 'nav-search-term');
      const a = createElement('a', '', { href: resultsUrl(term) });
      a.append(...highlight(term, phrase));
      li.append(a);
      return li;
    }));
  }

  async function showTrending() {
    showTermList([text.trendingSearches], trendingTerms);
    terms.hidden = !trendingTerms.length;
    trending = trending || fetchTrendingProducts();
    const items = await trending;
    if (input.value.trim().length >= MIN_CHARS) return;
    showProducts([text.trending], items, searchPath);
  }

  async function runSearch(phrase) {
    request += 1;
    const current = request;
    searchApi = searchApi || import('../../scripts/initializers/search.js')
      .then(() => import('@dropins/storefront-product-discovery/api.js'));
    const productSearch = searchApi.then(({ search }) => search({
      phrase,
      pageSize: PRODUCT_COUNT,
      filter: [{ attribute: 'visibility', in: ['Search', 'Catalog, Search'] }],
    }, { scope: 'popover' })).catch(() => null);
    const [result, suggestions] = await Promise.all([productSearch, fetchSuggestions(phrase)]);
    // a newer keystroke has started another search
    if (current !== request || input.value.trim() !== phrase) return;

    const items = result?.items || [];
    if (suggestions.length) {
      showTermList([text.suggestions], suggestions, phrase);
    } else if (!items.length) {
      showTermList(fillLabel(text.noResults, { phrase }), []);
    }
    terms.hidden = !suggestions.length && !!items.length;

    if (items.length) {
      showProducts(fillLabel(text.resultsFor, { phrase }), items, resultsUrl(phrase));
    } else {
      // like the source: nothing found, so offer the trending products instead
      trending = trending || fetchTrendingProducts();
      const fallback = await trending;
      if (current !== request) return;
      showProducts([text.trending], fallback, searchPath);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const phrase = input.value.trim();
    if (phrase.length < MIN_CHARS) {
      request += 1;
      showTrending();
      return;
    }
    debounceTimer = setTimeout(() => runSearch(phrase), 250);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const phrase = input.value.trim();
    if (phrase) window.location.href = resultsUrl(phrase);
  });

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusables = [...panel.querySelectorAll('a[href], button:not([disabled]), input')]
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

  function toggle(state) {
    const show = state ?? panel.hidden;
    if (show === !panel.hidden) return;
    panel.hidden = !show;
    button.setAttribute('aria-expanded', show ? 'true' : 'false');
    overlay.classList.toggle('show', show);
    document.body.style.overflowY = show ? 'hidden' : '';
    if (show) {
      if (input.value.trim().length < MIN_CHARS) showTrending();
      panel.addEventListener('keydown', trapFocus);
      input.focus();
    } else {
      panel.removeEventListener('keydown', trapFocus);
      if (panel.contains(document.activeElement) || document.activeElement === document.body) button.focus();
    }
  }

  button.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));
  overlay.addEventListener('click', () => toggle(false));

  return { toggle, wrapper, panel };
}
