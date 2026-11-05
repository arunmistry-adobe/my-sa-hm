import { createOptimizedPicture } from '../../scripts/aem.js';

function optimizePictures(root) {
  root.querySelectorAll('picture > img').forEach((img) => {
    const url = new URL(img.src, window.location.href);
    if (url.origin !== window.location.origin || /\.svg$/i.test(url.pathname)) return;
    img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ media: '(min-width: 900px)', width: '2000' }, { width: '900' }]));
  });
}

export default function decorate(block) {
  const pictures = [...block.querySelectorAll('picture')];

  let media = null;
  if (pictures.length) {
    media = document.createElement('div');
    media.className = 'hero-content-bottom-media';
    pictures.forEach((pic, i) => {
      const holder = pic.parentElement;
      if (pictures.length > 1) {
        pic.classList.add(i === 0 ? 'hero-content-bottom-media-desktop' : 'hero-content-bottom-media-mobile');
      }
      media.append(pic);
      if (holder && holder.tagName === 'P' && !holder.textContent.trim() && !holder.children.length) holder.remove();
    });
    optimizePictures(media);
  }

  const content = document.createElement('div');
  content.className = 'hero-content-bottom-content';
  [...block.children].flatMap((row) => [...row.children]).forEach((cell) => {
    if (!cell.children.length && cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      content.append(p);
      return;
    }
    [...cell.children].forEach((el) => {
      if (!el.textContent.trim() && !el.querySelector('img')) return;
      content.append(el);
    });
  });

  // the first link is the banner's primary CTA; it stretches over the whole banner
  const cta = content.querySelector('a[href]');
  if (cta) {
    cta.classList.add('hero-content-bottom-cta');
    const holder = cta.parentElement;
    if (holder && holder.tagName === 'P' && holder.textContent.trim() === cta.textContent.trim()) {
      holder.classList.add('hero-content-bottom-cta-wrapper');
    }
    block.classList.add('hero-content-bottom-linked');
    block.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      if (window.getSelection && String(window.getSelection())) return;
      cta.click();
    });
  }

  block.replaceChildren(...[media, content.children.length ? content : null].filter(Boolean));
}
