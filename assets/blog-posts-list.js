import PaginatedList from '@theme/paginated-list';
import { sectionRenderer } from '@theme/section-renderer';
import { requestIdleCallback } from '@theme/utilities';

/**
 * A custom element that renders a paginated blog posts list.
 *
 * Two loading modes, decided by the markup the section renders:
 * - a `viewMoreNext` sentinel enables the scroll-triggered loading inherited from `PaginatedList`
 * - a `loadMore` button appends the next page on click via {@linkcode loadNextPage}
 *
 * The button is a real link to the next page, so pagination still works without JS.
 *
 * @typedef {object} BlogPostsListRefs
 * @property {HTMLElement} [grid] - The grid element.
 * @property {HTMLAnchorElement} [loadMore] - The load more button.
 * @property {HTMLElement[]} [cards] - The card elements.
 */
export default class BlogPostsList extends PaginatedList {
  #loading = false;

  /**
   * Appends the next page of articles to the grid.
   * Bound declaratively via `on:click` on the load more button.
   *
   * @param {MouseEvent} [event]
   */
  async loadNextPage(event) {
    event?.preventDefault();

    /** @type {BlogPostsListRefs} */
    const { grid, loadMore } = this.refs;

    if (!grid || !loadMore || this.#loading) return;

    const nextUrl = new URL(loadMore.href, window.location.href);
    const nextPage = Number(nextUrl.searchParams.get('page'));
    const lastPage = Number(grid.dataset.lastPage);

    if (!nextPage || !lastPage || nextPage > lastPage) return;

    this.#loading = true;
    loadMore.setAttribute('aria-busy', 'true');

    try {
      const cards = await this.#getCards(nextPage, nextUrl);

      if (!cards.length) return;

      const [firstNewCard] = cards;
      grid.append(...cards);


      if (nextPage < lastPage) {
        const followingUrl = new URL(nextUrl);
        followingUrl.searchParams.set('page', String(nextPage + 1));
        loadMore.href = followingUrl.toString();

        requestIdleCallback(() => this.#fetchHTML(nextPage + 1, followingUrl));
      } else {
        loadMore.remove();
      }

      firstNewCard?.querySelector('a')?.focus({ preventScroll: true });
    } catch (error) {
      console.error(error);
    } finally {
      this.#loading = false;
      loadMore.removeAttribute('aria-busy');
    }
  }

  /**
   * Returns the card elements for a page, reusing anything `PaginatedList` already prefetched.
   *
   * @param {number} page - The page number.
   * @param {URL} url - The URL of that page.
   * @returns {Promise<Element[]>} The card elements.
   */
  async #getCards(page, url) {
    const html = await this.#fetchHTML(page, url);
    const grid = new DOMParser().parseFromString(html, 'text/html').querySelector('[ref="grid"]');

    return grid ? Array.from(grid.querySelectorAll(':scope > [ref="cards[]"]')) : [];
  }

  /**
   * Fetches a page of the section and caches it.
   *
   * @param {number} page - The page number.
   * @param {URL} url - The URL of that page.
   * @returns {Promise<string>} The section HTML.
   */
  async #fetchHTML(page, url) {
    const cached = this.pages.get(page);

    if (cached) return cached;

    // `getSectionHTML` adds `section_id` to the URL it is handed, so give it a copy — the original
    // is the reader-facing URL we push to the address bar.
    const html = await sectionRenderer.getSectionHTML(this.sectionId, true, new URL(url));
    this.pages.set(page, html);

    return html;
  }
}

if (!customElements.get('blog-posts-list')) {
  customElements.define('blog-posts-list', BlogPostsList);
}
