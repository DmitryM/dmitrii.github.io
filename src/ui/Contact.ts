/**
 * Email links are rendered as reversed fragments; the address is only assembled on interaction,
 * which keeps it out of the static HTML that naive scrapers read.
 */
const rev = (s: string) => [...s].reverse().join('');

export function setupContact() {
  document.querySelectorAll<HTMLAnchorElement>('a[data-email]').forEach((a) => {
    const reveal = () => {
      const address = `${rev(a.dataset.u ?? '')}@${rev(a.dataset.d ?? '')}`;
      a.href = `mailto:${address}`;
      const handle = a.querySelector('.link__handle');
      if (handle) handle.textContent = address;
      return address;
    };
    a.addEventListener('pointerenter', reveal, { once: true });
    a.addEventListener('focus', reveal, { once: true });
    a.addEventListener('click', (e) => {
      if (!a.href.startsWith('mailto:')) {
        e.preventDefault();
        window.location.href = `mailto:${reveal()}`;
      }
    });
  });
}
