import { createOptimizedPicture } from '../../scripts/aem.js';
import { setImageSizes } from '../../scripts/scripts.js';

function optimizePictures(root) {
  root.querySelectorAll('picture > img').forEach((img) => {
    const url = new URL(img.src, window.location.href);
    if (url.origin !== window.location.origin || /\.svg$/i.test(url.pathname)) return;
    img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ media: '(min-width: 900px)', width: '1000' }, { width: '750' }]));
  });
}

// aem.js wrapTextNodes wraps a cell that starts with <picture> (picture, h2, p)
// in a single <p>; unwrap it so the heading and CTA paragraph are real children.
function unwrapCell(cell) {
  const only = cell.children.length === 1 ? cell.firstElementChild : null;
  if (only && only.tagName === 'P'
    && only.querySelector(':scope > :is(picture, h1, h2, h3, h4, h5, h6, p, ul, ol, div)')) {
    only.replaceWith(...only.childNodes);
  }
}

function buildTeaser(cell) {
  unwrapCell(cell);
  const teaser = document.createElement('div');
  teaser.className = 'columns-teaser-pair-teaser';

  const pictures = [...cell.querySelectorAll('picture')];
  if (pictures.length) {
    const media = document.createElement('div');
    media.className = 'columns-teaser-pair-media';
    pictures.forEach((pic, i) => {
      const holder = pic.parentElement;
      if (pictures.length > 1) {
        pic.classList.add(i === 0 ? 'columns-teaser-pair-media-desktop' : 'columns-teaser-pair-media-mobile');
      }
      media.append(pic);
      if (holder && holder !== cell && holder.tagName === 'P' && !holder.textContent.trim() && !holder.children.length) holder.remove();
    });
    optimizePictures(media);
    teaser.append(media);
  }

  const content = document.createElement('div');
  content.className = 'columns-teaser-pair-content';
  if (!cell.children.length && cell.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = cell.textContent.trim();
    content.append(p);
  }
  [...cell.children].forEach((el) => {
    if (!el.textContent.trim() && !el.querySelector('img')) return;
    content.append(el);
  });

  const cta = content.querySelector('a[href]');
  if (cta) {
    cta.classList.add('columns-teaser-pair-cta');
    teaser.classList.add('columns-teaser-pair-linked');
    teaser.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      if (window.getSelection && String(window.getSelection())) return;
      cta.click();
    });
  }
  if (content.children.length) teaser.append(content);
  return teaser.children.length ? teaser : null;
}

export default function decorate(block) {
  // every non-empty cell, across all rows, is one teaser
  const teasers = [...block.children]
    .flatMap((row) => [...row.children])
    .map(buildTeaser)
    .filter(Boolean);

  block.classList.add(`columns-teaser-pair-${teasers.length}-cols`);
  block.replaceChildren(...teasers);
  // side by side from 900px, stacked full width below
  if (teasers.length > 1) setImageSizes(block, '(min-width: 900px) 50vw, 100vw');
}
