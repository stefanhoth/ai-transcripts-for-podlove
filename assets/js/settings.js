(function () {
    'use strict';

    var config = window.aiTranscriptsSettings;
    if (!config) return;

    var POLL_INTERVAL = 5000;
    var MAX_POLLS = 360;

    var batchContainer = document.getElementById('ai-transcripts-for-podlove-batch');
    if (!batchContainer) return;

    var episodes = [];
    var batchRunning = false;
    var batchCancelled = false;
    var batchCurrent = 0;
    var batchTotal = 0;

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

    function escHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    }

    function loadEpisodes() {
        batchContainer.innerHTML = '<p><em>' + escHtml(config.i18n.loading) + '</em></p>';

        apiFetch('/episodes').then(function (res) {
            if (!res.ok || !Array.isArray(res.data)) {
                batchContainer.innerHTML = '<p>' + escHtml(config.i18n.noEpisodes) + '</p>';
                return;
            }

            episodes = res.data;
            renderEpisodeList();
        });
    }

    function renderEpisodeList() {
        if (episodes.length === 0) {
            batchContainer.innerHTML = '<p>' + escHtml(config.i18n.noEpisodes) + '</p>';
            return;
        }

        var html = '<div class="ai-transcripts-batch-toolbar" style="margin-bottom:12px;">';
        html += '<button type="button" class="button" data-action="select-all">' + escHtml(config.i18n.selectAll) + '</button> ';
        html += '<button type="button" class="button" data-action="select-without">' + escHtml(config.i18n.selectWithout) + '</button> ';
        html += '<button type="button" class="button" data-action="deselect-all">' + escHtml(config.i18n.deselectAll) + '</button>';
        html += '</div>';

        html += '<table class="wp-list-table widefat fixed striped">';
        html += '<thead><tr>';
        html += '<td class="manage-column column-cb check-column"><input type="checkbox" data-action="toggle-all" /></td>';
        html += '<th>' + escHtml('Episode') + '</th>';
        html += '<th>' + escHtml('Audio') + '</th>';
        html += '<th>' + escHtml('Transcript') + '</th>';
        html += '<th>' + escHtml('Status') + '</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        for (var i = 0; i < episodes.length; i++) {
            var ep = episodes[i];
            var disabled = !ep.has_audio || ep.url_error ? ' disabled' : '';
            html += '<tr data-post-id="' + ep.post_id + '">';
            html += '<th class="check-column"><input type="checkbox" value="' + ep.post_id + '"' + disabled + ' /></th>';
            var editUrl = config.adminUrl + 'post.php?post=' + ep.post_id + '&action=edit';
            html += '<td><a href="' + editUrl + '">' + escHtml(ep.title) + '</a></td>';
            html += '<td>' + renderAudioStatus(ep) + '</td>';
            html += '<td>' + (ep.has_transcript ? '\u2705' : '\u2014') + '</td>';
            html += '<td class="batch-status">' + renderStatus(ep.assemblyai_status) + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table>';

        html += '<div style="margin-top:12px;">';
        html += '<button type="button" class="button button-primary" data-action="batch-transcribe" disabled>'
            + escHtml(config.i18n.transcribe) + '</button> ';
        if (batchRunning) {
            html += '<button type="button" class="button" data-action="batch-cancel">' + escHtml(config.i18n.cancel) + '</button> ';
        }
        html += '<span class="batch-progress-message"></span>';
        html += '</div>';

        batchContainer.innerHTML = html;
        bindBatchEvents();
    }

    function renderAudioStatus(ep) {
        if (!ep.has_audio) return '\u274C';
        if (ep.url_error) return '\u26A0\uFE0F <span style="color:#dba617;" title="' + escHtml(ep.url_error) + '">' + escHtml(config.i18n.urlNotPublic) + '</span>';
        return '\u2705';
    }

    function renderStatus(status) {
        if (!status) return '<span style="color:#646970;">' + escHtml(config.i18n.idle) + '</span>';
        if (status === 'imported') return '<span style="color:#00a32a;">' + escHtml(config.i18n.completed) + '</span>';
        if (status === 'completed') return '<span style="color:#00a32a;">' + escHtml(config.i18n.completed) + '</span>';
        if (status === 'error') return '<span style="color:#d63638;">' + escHtml(config.i18n.failed) + '</span>';
        if (status === 'queued' || status === 'processing') return '<span style="color:#dba617;">' + escHtml(config.i18n.processing) + '</span>';
        return escHtml(status);
    }

    function bindBatchEvents() {
        var selectAllBtn = batchContainer.querySelector('[data-action="select-all"]');
        var selectWithoutBtn = batchContainer.querySelector('[data-action="select-without"]');
        var deselectAllBtn = batchContainer.querySelector('[data-action="deselect-all"]');
        var toggleAll = batchContainer.querySelector('[data-action="toggle-all"]');
        var batchBtn = batchContainer.querySelector('[data-action="batch-transcribe"]');
        var cancelBtn = batchContainer.querySelector('[data-action="batch-cancel"]');

        if (selectAllBtn) selectAllBtn.addEventListener('click', function () { setAllCheckboxes(true); });
        if (selectWithoutBtn) selectWithoutBtn.addEventListener('click', selectWithoutTranscript);
        if (deselectAllBtn) deselectAllBtn.addEventListener('click', function () { setAllCheckboxes(false); });
        if (toggleAll) toggleAll.addEventListener('change', function () { setAllCheckboxes(this.checked); });
        if (batchBtn) batchBtn.addEventListener('click', startBatch);
        if (cancelBtn) cancelBtn.addEventListener('click', cancelBatch);

        var boxes = batchContainer.querySelectorAll('tbody input[type="checkbox"]');
        for (var i = 0; i < boxes.length; i++) {
            boxes[i].addEventListener('change', updateBatchButton);
        }
    }

    function setAllCheckboxes(checked) {
        var boxes = batchContainer.querySelectorAll('tbody input[type="checkbox"]:not(:disabled)');
        for (var i = 0; i < boxes.length; i++) {
            boxes[i].checked = checked;
        }
        updateBatchButton();
    }

    function selectWithoutTranscript() {
        var boxes = batchContainer.querySelectorAll('tbody input[type="checkbox"]');
        for (var i = 0; i < boxes.length; i++) {
            var postId = parseInt(boxes[i].value, 10);
            var ep = episodes.find(function (e) { return e.post_id === postId; });
            boxes[i].checked = ep && !ep.has_transcript && ep.has_audio && !ep.url_error;
        }
        updateBatchButton();
    }

    function getSelectedPostIds() {
        var boxes = batchContainer.querySelectorAll('tbody input[type="checkbox"]:checked');
        var ids = [];
        for (var i = 0; i < boxes.length; i++) {
            ids.push(parseInt(boxes[i].value, 10));
        }
        return ids;
    }

    function updateBatchButton() {
        var btn = batchContainer.querySelector('[data-action="batch-transcribe"]');
        if (btn) btn.disabled = batchRunning || getSelectedPostIds().length === 0;
    }

    function startBatch() {
        var postIds = getSelectedPostIds();
        if (postIds.length === 0) return;

        // Check if any selected episodes already have transcripts
        var withTranscripts = episodes.filter(function (ep) {
            return postIds.indexOf(ep.post_id) !== -1 && ep.has_transcript;
        });

        if (withTranscripts.length > 0) {
            showBatchConfirm(postIds, withTranscripts);
            return;
        }

        runBatch(postIds);
    }

    function showBatchConfirm(postIds, withTranscripts) {
        var names = withTranscripts.map(function (ep) { return ep.title; }).join(', ');
        var confirmHtml = '<div class="ai-transcripts-confirm" style="margin-top:12px;">'
            + '<p>' + escHtml(config.i18n.batchConfirmReplace.replace('%episodes%', names)) + '</p>'
            + '<div style="display:flex;gap:8px;">'
            + '<button type="button" class="button button-primary" data-action="batch-confirm-yes">'
            + escHtml(config.i18n.batchConfirmYes) + '</button>'
            + '<button type="button" class="button" data-action="batch-confirm-no">'
            + escHtml(config.i18n.batchConfirmNo) + '</button>'
            + '</div></div>';

        // Insert confirmation after the table actions
        var actionsDiv = batchContainer.querySelector('.ai-transcripts-confirm');
        if (actionsDiv) actionsDiv.remove();

        batchContainer.insertAdjacentHTML('beforeend', confirmHtml);

        var yesBtn = batchContainer.querySelector('[data-action="batch-confirm-yes"]');
        var noBtn = batchContainer.querySelector('[data-action="batch-confirm-no"]');
        if (yesBtn) yesBtn.addEventListener('click', function () { runBatch(postIds); });
        if (noBtn) noBtn.addEventListener('click', function () {
            var el = batchContainer.querySelector('.ai-transcripts-confirm');
            if (el) el.remove();
        });
    }

    function runBatch(postIds) {
        batchRunning = true;
        batchCancelled = false;
        batchCurrent = 0;
        batchTotal = postIds.length;

        // Mark all selected as queued immediately
        for (var i = 0; i < postIds.length; i++) {
            updateRowStatus(postIds[i], config.i18n.queued);
        }

        // Remove any lingering confirmation
        var confirmEl = batchContainer.querySelector('.ai-transcripts-confirm');
        if (confirmEl) confirmEl.remove();

        // Update toolbar (disable transcribe button, show cancel)
        var batchBtn = batchContainer.querySelector('[data-action="batch-transcribe"]');
        if (batchBtn) batchBtn.disabled = true;

        var actionsDiv = batchBtn ? batchBtn.parentNode : null;
        if (actionsDiv && !batchContainer.querySelector('[data-action="batch-cancel"]')) {
            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'button';
            cancelBtn.setAttribute('data-action', 'batch-cancel');
            cancelBtn.textContent = config.i18n.cancel;
            cancelBtn.addEventListener('click', cancelBatch);
            actionsDiv.insertBefore(cancelBtn, batchBtn.nextSibling);
            actionsDiv.insertBefore(document.createTextNode(' '), cancelBtn);
        }

        processNext(postIds, 0);
    }

    function cancelBatch() {
        batchCancelled = true;
    }

    function processNext(postIds, index) {
        if (index >= postIds.length || batchCancelled) {
            batchRunning = false;
            renderEpisodeList();
            var msgEl = batchContainer.querySelector('.batch-progress-message');
            if (msgEl) {
                msgEl.textContent = batchCancelled ? '' : config.i18n.batchDone;
            }
            return;
        }

        batchCurrent = index + 1;
        var postId = postIds[index];
        updateProgressMessage();
        updateRowStatus(postId, config.i18n.processing);

        apiFetch('/transcribe/' + postId, { method: 'POST' }).then(function (res) {
            if (!res.ok) {
                updateRowStatus(postId, config.i18n.failed);
                updateEpisodeStatus(postId, 'error');
                processNext(postIds, index + 1);
                return;
            }

            pollUntilDone(postId, 0, function (success) {
                if (success) {
                    importAndContinue(postId, postIds, index);
                } else {
                    updateRowStatus(postId, config.i18n.failed);
                    updateEpisodeStatus(postId, 'error');
                    processNext(postIds, index + 1);
                }
            });
        }).catch(function () {
            updateRowStatus(postId, config.i18n.failed);
            updateEpisodeStatus(postId, 'error');
            processNext(postIds, index + 1);
        });
    }

    function pollUntilDone(postId, count, callback) {
        if (batchCancelled || count > MAX_POLLS) {
            callback(false);
            return;
        }

        setTimeout(function () {
            apiFetch('/status/' + postId).then(function (res) {
                if (!res.ok) {
                    pollUntilDone(postId, count + 1, callback);
                    return;
                }

                if (res.data.status === 'completed') {
                    callback(true);
                } else if (res.data.status === 'error') {
                    callback(false);
                } else {
                    updateRowStatus(postId, config.i18n.processing + ' (' + (res.data.status || '') + ')');
                    pollUntilDone(postId, count + 1, callback);
                }
            }).catch(function () {
                pollUntilDone(postId, count + 1, callback);
            });
        }, POLL_INTERVAL);
    }

    function importAndContinue(postId, postIds, index) {
        apiFetch('/import/' + postId, { method: 'POST' }).then(function (res) {
            if (res.ok) {
                updateRowStatus(postId, config.i18n.completed);
                updateEpisodeStatus(postId, 'imported');
            } else {
                updateRowStatus(postId, config.i18n.failed);
                updateEpisodeStatus(postId, 'error');
            }
            processNext(postIds, index + 1);
        }).catch(function () {
            updateRowStatus(postId, config.i18n.failed);
            updateEpisodeStatus(postId, 'error');
            processNext(postIds, index + 1);
        });
    }

    function updateRowStatus(postId, statusHtml) {
        var row = batchContainer.querySelector('tr[data-post-id="' + postId + '"]');
        if (row) {
            var cell = row.querySelector('.batch-status');
            if (cell) cell.innerHTML = escHtml(statusHtml);
        }
    }

    function updateEpisodeStatus(postId, status) {
        for (var i = 0; i < episodes.length; i++) {
            if (episodes[i].post_id === postId) {
                episodes[i].assemblyai_status = status;
                if (status === 'imported') episodes[i].has_transcript = true;
                break;
            }
        }
    }

    function updateProgressMessage() {
        var msgEl = batchContainer.querySelector('.batch-progress-message');
        if (msgEl) {
            var msg = config.i18n.batchProgress
                .replace('%current%', batchCurrent)
                .replace('%total%', batchTotal);
            msgEl.textContent = msg;
        }
    }

    loadEpisodes();
})();
