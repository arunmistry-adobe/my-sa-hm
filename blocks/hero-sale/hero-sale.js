import { createOptimizedPicture } from '../../scripts/aem.js';

// MM/DD/YYYY hh:mm[:ss] [AM|PM], e.g. "03/21/2026 10:00:00 AM" (local time)
const DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i;

function parseEndDate(text) {
  const m = DATE_RE.exec(text || '');
  if (!m) return null;
  const [, mo, d, y, h, mi, s, ampm] = m;
  let hours = Number(h);
  if (ampm) {
    const pm = ampm.toUpperCase() === 'PM';
    if (hours === 12) hours = pm ? 12 : 0;
    else if (pm) hours += 12;
  }
  const date = new Date(Number(y), Number(mo) - 1, Number(d), hours, Number(mi), Number(s || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function optimizePictures(root) {
  root.querySelectorAll('picture > img').forEach((img) => {
    const url = new URL(img.src, window.location.href);
    if (url.origin !== window.location.origin || /\.svg$/i.test(url.pathname)) return;
    img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }]));
  });
}

// UI labels built by the block (not authored), per page language
const LABELS = {
  en: {
    shopNow: 'Shop Now', close: 'Close', days: 'Days', hours: 'Hours', minutes: 'Mins', seconds: 'Secs',
  },
  ar: {
    shopNow: 'تسوقي الآن', close: 'إغلاق', days: 'أيام', hours: 'ساعات', minutes: 'دقائق', seconds: 'ثوانٍ',
  },
};

function getLabels() {
  return LABELS[document.documentElement.lang] || LABELS.en;
}

function buildCountdown(endDate) {
  const wrap = document.createElement('div');
  wrap.className = 'hero-sale-countdown';
  wrap.setAttribute('role', 'timer');
  const labels = getLabels();
  const units = ['days', 'hours', 'minutes', 'seconds'].map((key) => [key, labels[key]]);
  const values = {};
  units.forEach(([key, label]) => {
    const unit = document.createElement('div');
    unit.className = `hero-sale-countdown-unit hero-sale-countdown-${key}`;
    const value = document.createElement('span');
    value.className = 'hero-sale-countdown-value';
    const name = document.createElement('span');
    name.className = 'hero-sale-countdown-label';
    name.textContent = label;
    unit.append(value, name);
    wrap.append(unit);
    values[key] = value;
  });

  let timer;
  const tick = () => {
    const diff = endDate.getTime() - Date.now();
    if (diff <= 0) {
      clearInterval(timer);
      wrap.remove();
      return;
    }
    const total = Math.floor(diff / 1000);
    values.days.textContent = String(Math.floor(total / 86400)).padStart(2, '0');
    values.hours.textContent = String(Math.floor((total % 86400) / 3600)).padStart(2, '0');
    values.minutes.textContent = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    values.seconds.textContent = String(total % 60).padStart(2, '0');
  };
  if (endDate.getTime() <= Date.now()) return null;
  tick();
  timer = setInterval(tick, 1000);
  return wrap;
}

export default function decorate(block) {
  const pictures = [...block.querySelectorAll('picture')];

  // background media (desktop first, optional mobile crop second)
  let media = null;
  if (pictures.length) {
    media = document.createElement('div');
    media.className = 'hero-sale-media';
    pictures.forEach((pic, i) => {
      const holder = pic.parentElement;
      if (pictures.length > 1) pic.classList.add(i === 0 ? 'hero-sale-media-desktop' : 'hero-sale-media-mobile');
      media.append(pic);
      if (holder && holder !== block && holder.tagName === 'P' && !holder.textContent.trim() && !holder.children.length) holder.remove();
    });
    optimizePictures(media);
  }

  const content = document.createElement('div');
  content.className = 'hero-sale-content';
  const ctas = document.createElement('ul');
  ctas.className = 'hero-sale-ctas';
  const legal = [];
  let countdownSource = null;

  // collect content from every cell, in order, defensively
  const cells = [...block.children].flatMap((row) => [...row.children]);
  cells.forEach((cell) => {
    [...cell.children].forEach((el) => {
      const text = el.textContent.trim();
      const links = el.querySelectorAll('a');
      if (!text && !el.querySelector('picture, img')) return;
      if (/^H[1-6]$/.test(el.tagName) && !countdownSource && parseEndDate(text)) {
        countdownSource = el;
      } else if (/^H[1-6]$/.test(el.tagName) && !content.querySelector('.hero-sale-heading')) {
        el.classList.add('hero-sale-heading');
        content.append(el);
      } else if (links.length && [...links].map((a) => a.textContent).join('').trim() === text) {
        links.forEach((a) => {
          const li = document.createElement('li');
          a.classList.add('hero-sale-cta');
          li.append(a);
          ctas.append(li);
        });
      } else if (!countdownSource && parseEndDate(text)) {
        countdownSource = el;
      } else if (el.tagName === 'P' || el.tagName === 'DIV') {
        legal.push(el);
      } else {
        content.append(el);
      }
    });
    // bare text directly inside a cell (no wrapping element)
    if (!cell.children.length && cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      if (parseEndDate(p.textContent) && !countdownSource) countdownSource = p;
      else legal.push(p);
    }
  });

  if (ctas.children.length) content.append(ctas);

  if (countdownSource) {
    const endDate = parseEndDate(countdownSource.textContent);
    const countdown = endDate ? buildCountdown(endDate) : null;
    if (countdown) {
      countdown.dataset.end = endDate.toISOString();
      content.append(countdown);
    }
  }

  if (legal.length) {
    const legalWrap = document.createElement('div');
    legalWrap.className = 'hero-sale-legal';
    legal.forEach((el) => legalWrap.append(el));
    content.append(legalWrap);
  }

  block.classList.toggle('hero-sale-has-media', !!media);
  block.replaceChildren(...[media, content].filter(Boolean));

  // source behaviour: several CTAs collapse behind a "Shop Now" toggle in the bottom bar
  // that opens a CTA panel over a dimmed banner; a single CTA is shown directly
  const ctaCount = ctas.children.length;
  if (ctaCount > 1) {
    ctas.id = `hero-sale-ctas-${[...document.querySelectorAll('.hero-sale')].indexOf(block)}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'hero-sale-toggle';
    toggle.setAttribute('aria-controls', ctas.id);
    const label = document.createElement('span');
    toggle.append(label);
    const labels = getLabels();
    const setExpanded = (expanded) => {
      block.classList.toggle('expanded', expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      label.textContent = expanded ? labels.close : labels.shopNow;
    };
    setExpanded(false);
    toggle.addEventListener('click', () => setExpanded(!block.classList.contains('expanded')));
    block.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && block.classList.contains('expanded')) {
        setExpanded(false);
        toggle.focus();
      }
    });
    content.append(toggle);
  } else if (ctaCount === 1) {
    block.classList.add('hero-sale-single-cta');
  }
}
