(function () {
    'use strict';

    var config = window.aiTranscripts;
    if (!config) return;

    var POLL_INTERVAL = 5000;
    var MAX_POLLS = 360; // 30 minutes

    var state = {
        status: config.initialStatus === 'imported' || config.initialStatus === 'completed'
            ? 'imported'
            : (config.initialStatus === 'queued' || config.initialStatus === 'processing')
                ? 'processing'
                : 'idle',
        error: null,
        assemblyaiStatus: config.initialStatus || null,
        hasTranscript: config.initialStatus === 'imported' || config.initialStatus === 'completed',
        pollCount: 0,
        pollTimer: null,
    };

    var container = document.getElementById('ai-transcripts-metabox');
    if (!container) return;

    // After a post-import reload, scroll back to this meta box.
    // Use a delay so the Gutenberg editor has time to finish rendering.
    try {
        if (sessionStorage.getItem('ai-transcripts-scroll')) {
            sessionStorage.removeItem('ai-transcripts-scroll');
            setTimeout(function () {
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 1500);
        }
    } catch (e) {}

    function apiFetch(path, options) {
        var url = config.restBase + path;
        var opts = Object.assign({
            headers: {
                'X-WP-Nonce': config.nonce,
                'Content-Type': 'application/json',
            },
        }, options || {});

        return fetch(url, opts).then(function (response) {
            return response.json().then(function (data) {
                return { ok: response.ok, data: data };
            });
        });
    }

    function render() {
        var html = '';

        switch (state.status) {
            case 'idle':
                html = renderIdle();
                break;
            case 'confirm':
                html = renderConfirm();
                break;
            case 'submitting':
                html = renderSpinner(config.i18n.submitting);
                break;
            case 'processing':
                var label = config.i18n.transcribing;
                if (state.assemblyaiStatus) {
                    var statusLabel = config.i18n[state.assemblyaiStatus] || state.assemblyaiStatus;
                    label += ' (' + statusLabel + ')';
                }
                html = renderSpinner(label);
                break;
            case 'importing':
                html = renderSpinner(config.i18n.importing);
                break;
            case 'imported':
                html = '<p class="ai-transcripts-success">' + escHtml(config.i18n.imported) + '</p>'
                    + '<button type="button" class="button" data-action="transcribe-again">'
                    + escHtml(config.i18n.transcribeAgain) + '</button>';
                break;
            case 'error':
                html = '<p class="ai-transcripts-error">'
                    + escHtml(state.error || config.i18n.error) + '</p>'
                    + '<button type="button" class="button" data-action="transcribe">'
                    + escHtml(config.i18n.retry) + '</button>';
                break;
        }

        container.innerHTML = html;
        bindEvents();
    }

    function renderIdle() {
        return '<button type="button" class="button button-primary" data-action="transcribe">'
            + escHtml(config.i18n.startTranscription) + '</button>';
    }

    function renderConfirm() {
        return '<div class="ai-transcripts-confirm">'
            + '<p>' + escHtml(config.i18n.confirmReplace) + '</p>'
            + '<div class="ai-transcripts-confirm-actions">'
            + '<button type="button" class="button button-primary" data-action="confirm-yes">'
            + escHtml(config.i18n.confirmYes) + '</button>'
            + '<button type="button" class="button" data-action="confirm-no">'
            + escHtml(config.i18n.confirmNo) + '</button>'
            + '</div></div>';
    }

    function renderSpinner(label) {
        return '<div class="ai-transcripts-status">'
            + '<span class="spinner is-active" style="float:none;"></span>'
            + '<span>' + escHtml(label) + '</span>'
            + '</div>';
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    }

    function bindEvents() {
        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                switch (action) {
                    case 'transcribe':
                        onTranscribe();
                        break;
                    case 'transcribe-again':
                        onTranscribeAgain();
                        break;
                    case 'confirm-yes':
                        startTranscription();
                        break;
                    case 'confirm-no':
                        state.status = 'imported';
                        render();
                        break;
                }
            });
        });
    }

    function onTranscribe() {
        startTranscription();
    }

    function onTranscribeAgain() {
        // Check live transcript status before deciding to confirm
        apiFetch('/config?post_id=' + config.postId).then(function (res) {
            if (res.ok && res.data.has_transcript) {
                state.status = 'confirm';
                render();
            } else {
                startTranscription();
            }
        }).catch(function () {
            // On error, be safe and show confirmation
            state.status = 'confirm';
            render();
        });
    }

    function startTranscription() {
        state.status = 'submitting';
        state.error = null;
        render();

        apiFetch('/transcribe/' + config.postId, { method: 'POST' }).then(function (res) {
            if (!res.ok) {
                setError(res.data.error || config.i18n.error);
                return;
            }

            state.status = 'processing';
            state.assemblyaiStatus = res.data.status;
            state.pollCount = 0;
            render();
            startPolling();
        }).catch(function () {
            setError(config.i18n.error);
        });
    }

    function startPolling() {
        stopPolling();
        state.pollTimer = setInterval(pollStatus, POLL_INTERVAL);
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function pollStatus() {
        state.pollCount++;

        if (state.pollCount > MAX_POLLS) {
            stopPolling();
            setError('Transcription timed out after 30 minutes.');
            return;
        }

        apiFetch('/status/' + config.postId).then(function (res) {
            if (!res.ok) {
                // Don't fail on transient errors, keep polling
                return;
            }

            state.assemblyaiStatus = res.data.status;

            if (res.data.status === 'completed') {
                stopPolling();
                importTranscript();
            } else if (res.data.status === 'error') {
                stopPolling();
                setError(res.data.error || 'AssemblyAI returned an error.');
            } else {
                render();
            }
        });
    }

    function importTranscript() {
        state.status = 'importing';
        render();

        apiFetch('/import/' + config.postId, { method: 'POST' }).then(function (res) {
            if (!res.ok) {
                setError(res.data.error || config.i18n.error);
                return;
            }

            state.hasTranscript = true;

            // Reload the page so the Podlove Transcripts section also updates.
            // Save scroll target so we can scroll back after reload.
            try { sessionStorage.setItem('ai-transcripts-scroll', '1'); } catch (e) {}
            window.location.reload();
        }).catch(function () {
            setError(config.i18n.error);
        });
    }

    function setError(msg) {
        state.status = 'error';
        state.error = msg;
        stopPolling();
        render();
    }

    // Resume polling if page loads with an in-progress transcription
    if (state.status === 'processing') {
        startPolling();
    }

    render();
})();
