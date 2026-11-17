/* Sends a form to Forminit. Usage: jgSubmitForm(form, statusEl, successMessage, onSuccess) */
(function () {
    var ENDPOINT = 'https://forminit.com/f/f23eapw84bb';
    window.jgSubmitForm = function (form, status, okMsg, onSuccess) {
        var btn = form.querySelector('button[type="submit"]');
        var label = btn ? btn.textContent : '';
        function say(msg, ok) {
            status.textContent = msg;
            status.style.color = ok ? '#2e7d32' : '#d9534f';
        }
        function done() { if (btn) { btn.disabled = false; btn.textContent = label; } }
        if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
        say('', true);
        fetch(ENDPOINT, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, code: r.status, j: j }; });
            })
            .then(function (res) {
                done();
                if (res.ok && res.j.success !== false) {
                    say(okMsg, true);
                    form.reset();
                    if (onSuccess) onSuccess();
                } else if (res.code === 429) {
                    say('Please wait a few seconds and try again.', false);
                } else {
                    say('Sorry, the form could not be sent. Please call or WhatsApp +91 93227 42472, or email jangidarchitects@gmail.com.', false);
                }
            })
            .catch(function () {
                done();
                say('Sorry, the form could not be sent. Please check your connection, or call or WhatsApp +91 93227 42472.', false);
            });
    };
})();
