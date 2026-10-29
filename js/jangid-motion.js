/* Jangid Architects: gentle scroll-reveal animation.
   Sections and cards fade up as they enter the screen. Visitors who prefer reduced motion,
   and browsers without IntersectionObserver, simply see the page as normal. */
(function () {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var groups = [
        '.jg-strip-item',
        '.jg-intro-text', '.jg-intro-img',
        '.jg-services-head', '.jg-services .jg-card',
        '.jg-clients-head', '.jg-clients-grid',
        '.jg-featured-head', '.jg-featured .jg-project',
        '.jg-cta .container > *',
        '.jg-story .col-md-8 > *',
        '.jg-j-head', '.jg-journey .jg-track', '.jg-journey .jg-stage', '.jg-journey .jg-controls',
        '.jg-e-head', '.jg-expertise .jg-e-card',
        '.jg-r-head', '.jg-reg .jg-r-card',
        '.jg-jump .container',
        '.jg-svc-row',
        '.jg-p-head', '.jg-process .jg-step',
        '.jg-cats .jg-cat',
        '.jg-contact .col-md-5 > *', '.jg-contact .jg-form-card',
        '.jg-achievement .jg-title', '.jg-achievement .jg-counter',
        '.prague-shortcode-heading', '.prague-services-wrapper',
        '.prague-footer .jg-f-col'
    ];

    var items = [];
    groups.forEach(function (sel) {
        var seen = new Map();
        document.querySelectorAll(sel).forEach(function (el) {
            if (el.classList.contains('jg-reveal')) return;
            var parent = el.parentNode, n = seen.get(parent) || 0;
            seen.set(parent, n + 1);
            el.style.setProperty('--jg-d', (Math.min(n, 5) * 0.09).toFixed(2) + 's');
            el.classList.add('jg-reveal');
            items.push(el);
        });
    });
    if (!items.length) return;

    document.documentElement.classList.add('jg-motion');

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            if (e.isIntersecting) {
                e.target.classList.add('jg-in');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) { io.observe(el); });

    /* safety net: never leave anything hidden */
    setTimeout(function () {
        items.forEach(function (el) { el.classList.add('jg-in'); });
    }, 8000);
})();
