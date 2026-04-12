/**
 * Generated from Offline Capture Assistant export.
 *
 * Requirement: 加一个大按钮，按钮点击后显示这个元素的内容
 * Anchor: <p> inside post content
 * Insert position: after
 * Selector (from capture): body > section > div:nth-of-type(1) > div:nth-of-type(4) > ...
 *
 * Since the captured CSS selector is deeply nested and fragile,
 * we use a broader approach: find all <p> inside .cooked (Discourse post body)
 * and add a button after each one.
 */

function init() {
  // Target: all paragraph elements inside post content on Discourse
  const posts = document.querySelectorAll('.topic-post .cooked p');

  if (posts.length === 0) {
    // Retry after a short delay (Discourse loads content dynamically)
    setTimeout(init, 1000);
    return;
  }

  posts.forEach((p) => {
    // Skip if already processed
    if (p.nextElementSibling?.classList.contains('show-content-btn')) {
      return;
    }

    // Skip empty paragraphs
    const text = p.textContent?.trim();
    if (!text) {
      return;
    }

    // Create the button — insert AFTER the <p> element
    const btn = document.createElement('button');
    btn.className = 'show-content-btn';
    btn.textContent = '显示此段落内容';

    let popup = null;

    btn.addEventListener('click', () => {
      if (popup) {
        popup.remove();
        popup = null;
        btn.textContent = '显示此段落内容';
        return;
      }

      popup = document.createElement('div');
      popup.className = 'show-content-popup';
      popup.textContent = p.textContent;
      btn.after(popup);
      btn.textContent = '隐藏内容';
    });

    // Insert after the paragraph
    p.after(btn);
  });
}

// Discourse uses Ember and loads content dynamically
// Run on initial load and observe for navigation changes
init();

// Re-run when Discourse navigates to a new topic (SPA navigation)
const observer = new MutationObserver(() => {
  init();
});
observer.observe(document.body, { childList: true, subtree: true });
