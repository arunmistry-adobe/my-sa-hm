import { createOptimizedPicture } from '../../scripts/aem.js';
import { setImageSizes } from '../../scripts/scripts.js';

function optimizePictures(root) {
  root.querySelectorAll('picture > img').forEach((img) => {
    const url = new URL(img.src, window.location.href);
    if (url.origin !== window.location.origin || /\.svg$/i.test(url.pathname)) return;
    img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
  });
}

function buildCard(row) {
  const li = document.createElement('li');
  li.className = 'cards-category-card';

  const image = document.createElement('div');
  image.className = 'cards-category-card-image';
  const body = document.createElement('div');
  body.className = 'cards-category-card-body';

  [...row.children].forEach((cell) => {
    // pictures go to the image slot wherever the author placed them
    cell.querySelectorAll('picture').forEach((pic) => {
      const holder = pic.parentElement;
      image.append(pic);
      if (holder && holder !== cell && holder.tagName === 'P' && !holder.textContent.trim() && !holder.children.length) holder.remove();
    });
    if (!cell.children.length && cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      body.append(p);
      return;
    }
    [...cell.children].forEach((el) => {
      if (!el.textContent.trim() && !el.querySelector('img')) return;
      body.append(el);
    });
  });

  if (!image.children.length && !body.children.length) return null;

  // desktop picture first, optional mobile crop second; extras are dropped
  const pics = [...image.querySelectorAll('picture')];
  pics.slice(2).forEach((pic) => pic.remove());
  if (pics.length > 1) {
    pics[0].classList.add('cards-category-media-desktop');
    pics[1].classList.add('cards-category-media-mobile');
  }

  if (image.children.length) li.append(image);
  if (body.children.length) li.append(body);

  const cta = body.querySelector('a[href]');
  if (cta) {
    cta.classList.add('cards-category-cta');
    li.classList.add('cards-category-linked');
    li.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      if (window.getSelection && String(window.getSelection())) return;
      cta.click();
    });
  }
  return li;
}

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].map(buildCard).filter(Boolean).forEach((li) => ul.append(li));
  optimizePictures(ul);
  // two tiles per row; the grid stops growing at 1120px
  setImageSizes(ul, '(min-width: 1120px) 560px, 50vw');
  block.replaceChildren(ul);
}
