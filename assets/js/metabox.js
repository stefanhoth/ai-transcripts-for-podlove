(function () {
    'use strict';

    var config = window.podloveAssemblyAI;
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
        pollCount: 0,
        pollTimer: null,
    };

    var container = document.getElementById('podlove-assemblyai-metabox');
    if (!container) return;

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
                html = '<p class="podlove-assemblyai-success">' + escHtml(config.i18n.imported) + '</p>'
                    + '<button type="button" class="button" data-action="reset">'
                    + escHtml(config.i18n.transcribeAgain) + '</button>';
                break;
            case 'error':
                html = '<p class="podlove-assemblyai-error">'
                    + escHtml(state.error || config.i18n.error) + '</p>'
                    + '<button type="button" class="button" data-action="reset">'
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

    function renderSpinner(label) {
        return '<div class="podlove-assemblyai-status">'
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
        var transcribeBtn = container.querySelector('[data-action="transcribe"]');
        if (transcribeBtn) {
            transcribeBtn.addEventListener('click', onTranscribe);
        }

        var resetBtn = container.querySelector('[data-action="reset"]');
        if (resetBtn) {
            resetBtn.addEventListener('click', onReset);
        }
    }

    function onTranscribe() {
        // Check for existing transcript via config endpoint
        apiFetch('/config').then(function (res) {
            if (!res.ok) {
                setError(res.data.error || config.i18n.error);
                return;
            }

            // Check if episode already has a transcript by looking at post meta
            if (config.initialStatus === 'imported') {
                if (!window.confirm(config.i18n.confirmReplace)) {
                    return;
                }
            }

            startTranscription();
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

            state.status = 'imported';
            config.initialStatus = 'imported';
            render();
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

    function onReset() {
        state.status = 'idle';
        state.error = null;
        state.assemblyaiStatus = null;
        render();
    }

    // Resume polling if page loads with an in-progress transcription
    if (state.status === 'processing') {
        startPolling();
    }

    render();
})();
