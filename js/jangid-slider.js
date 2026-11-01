/* Jangid Architects: home page hero slider.
   The next banner wipes in over the current one. Arrows, dots, swipe and autoplay all work.
   With reduced motion turned on there is no autoplay and no animation, but the buttons still work. */
(function () {
    var root = document.querySelector('.jg-hero-slider');
    if (!root) return;
    var slides = root.querySelectorAll('.jg-slide');
    var dots = root.querySelectorAll('.jg-hero-dot');
    var n = slides.length;
    if (n < 2) return;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var DELAY = 2500, ANIM_MS = 650, cur = 0, timer = null, busy = false;

    var info = root.querySelector('.jg-hero-info');
    var titleEl = root.querySelector('.jg-hero-title'), locEl = root.querySelector('.jg-hero-loc');

    function caption() {
        if (!info || !titleEl || !locEl) return;
        var t = slides[cur].getAttribute('data-title'), l = slides[cur].getAttribute('data-loc');
        if (!t) return;
        info.classList.add('is-changing');
        setTimeout(function () {
            titleEl.textContent = t;
            locEl.textContent = l || '';
            info.classList.remove('is-changing');
        }, 350);
    }

    function mark() {
        for (var k = 0; k < dots.length; k++) dots[k].classList.toggle('is-on', k === cur);
    }

    function go(i, back) {
        i = (i + n) % n;
        if (i === cur || busy) return;
        var from = slides[cur], to = slides[i];
        root.classList.toggle('is-back', !!back);

        from.classList.remove('is-active');
        to.classList.add('is-active');
        cur = i;
        mark();
        caption();

        if (reduce) { return; }
        busy = true;
        from.classList.add('is-leaving');
        to.classList.add('is-entering');
        setTimeout(function () {
            from.classList.remove('is-leaving');
            to.classList.remove('is-entering');
            busy = false;
        }, ANIM_MS);
    }

    function next() { go(cur + 1, false); }
    function prev() { go(cur - 1, true); }

    function start() { if (reduce) return; stop(); timer = setInterval(next, DELAY); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    var bNext = root.querySelector('.jg-hero-next'), bPrev = root.querySelector('.jg-hero-prev');
    if (bNext) bNext.addEventListener('click', function () { next(); start(); });
    if (bPrev) bPrev.addEventListener('click', function () { prev(); start(); });
    for (var d = 0; d < dots.length; d++) {
        (function (idx) {
            dots[idx].addEventListener('click', function () { go(idx, idx < cur); start(); });
        })(d);
    }

    /* pause while the tab is hidden */
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

    /* swipe on touch screens */
    var x0 = null;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); start(); }
        x0 = null;
    }, { passive: true });

    mark();
    start();
})();
