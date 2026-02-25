<?php

namespace AiTranscriptsForPodlove;

class SettingsPage
{
    public const OPTION_API_KEY = 'ai_transcripts_api_key';
    public const MENU_SLUG = 'ai-transcripts-for-podlove';

    public function __construct()
    {
        add_action('admin_menu', [$this, 'add_menu_page'], 50);
        add_action('admin_init', [$this, 'register_settings']);
    }

    public function add_menu_page()
    {
        // Add as submenu under Podlove if available, otherwise under Settings
        global $admin_page_hooks;
        $parent = isset($admin_page_hooks['podlove_settings_handle']) ? 'podlove_settings_handle' : 'options-general.php';

        add_submenu_page(
            $parent,
            __('AI Transcripts for Podlove', 'ai-transcripts-for-podlove'),
            __('AI Transcription', 'ai-transcripts-for-podlove'),
            'edit_posts',
            self::MENU_SLUG,
            [$this, 'render_page']
        );
    }

    public function register_settings()
    {
        register_setting('ai_transcripts', self::OPTION_API_KEY, [
            'type' => 'string',
            'sanitize_callback' => [$this, 'validate_api_key'],
            'default' => '',
        ]);
    }

    /**
     * Validate the API key against AssemblyAI before saving.
     */
    public function validate_api_key($value)
    {
        $value = sanitize_text_field($value);

        if (empty($value)) {
            return $value;
        }

        $response = wp_remote_get('https://api.assemblyai.com/v2/transcript?limit=1', [
            'headers' => ['Authorization' => $value],
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            add_settings_error(
                self::OPTION_API_KEY,
                'connection_failed',
                __('Could not connect to AssemblyAI to verify the key. Key saved anyway.', 'ai-transcripts-for-podlove'),
                'warning'
            );
            return $value;
        }

        $code = wp_remote_retrieve_response_code($response);

        if ($code === 401) {
            add_settings_error(
                self::OPTION_API_KEY,
                'invalid_key',
                __('AssemblyAI rejected this API key. Please check it and try again.', 'ai-transcripts-for-podlove'),
                'error'
            );
            return ''; // don't save invalid key
        }

        return $value;
    }


    /**
     * Check current API key validity against AssemblyAI.
     *
     * @return string 'valid', 'invalid', 'error', or 'empty'
     */
    private function check_api_key_status($api_key)
    {
        if (empty($api_key)) {
            return 'empty';
        }

        $response = wp_remote_get('https://api.assemblyai.com/v2/transcript?limit=1', [
            'headers' => ['Authorization' => $api_key],
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            return 'error';
        }

        $code = wp_remote_retrieve_response_code($response);

        if ($code === 401) {
            return 'invalid';
        }

        if ($code >= 200 && $code < 300) {
            return 'valid';
        }

        return 'error';
    }

    /**
     * Render an inline status indicator for the API key.
     */
    private function render_key_status_indicator($status)
    {
        switch ($status) {
            case 'valid':
                return '<span class="ai-transcripts-for-podlove-key-status ai-transcripts-for-podlove-key-valid" title="'
                    . esc_attr__('API key is valid', 'ai-transcripts-for-podlove')
                    . '">&#10003;</span>';
            case 'invalid':
                return '<span class="ai-transcripts-for-podlove-key-status ai-transcripts-for-podlove-key-invalid" title="'
                    . esc_attr__('API key is invalid', 'ai-transcripts-for-podlove')
                    . '">&#10007;</span>';
            case 'error':
                return '<span class="ai-transcripts-for-podlove-key-status ai-transcripts-for-podlove-key-error" title="'
                    . esc_attr__('Could not reach AssemblyAI to verify the key', 'ai-transcripts-for-podlove')
                    . '">?</span>';
            default:
                return '';
        }
    }

    public function render_page()
    {
        $api_key = get_option(self::OPTION_API_KEY, '');
        $has_key = !empty($api_key);
        $key_status = $this->check_api_key_status($api_key);

        if ($has_key) {
            wp_enqueue_script(
                'ai-transcripts-for-podlove-settings',
                AI_TRANSCRIPTS_URL . 'assets/js/settings.js',
                ['wp-api-fetch'],
                AI_TRANSCRIPTS_VERSION,
                true
            );

            wp_localize_script('ai-transcripts-for-podlove-settings', 'aiTranscriptsSettings', [
                'restBase' => rest_url('ai-transcripts-for-podlove/v1'),
                'nonce' => wp_create_nonce('wp_rest'),
                'adminUrl' => admin_url(),
                'i18n' => [
                    'transcribe' => __('Transcribe Selected', 'ai-transcripts-for-podlove'),
                    'cancel' => __('Cancel', 'ai-transcripts-for-podlove'),
                    'selectAll' => __('Select All', 'ai-transcripts-for-podlove'),
                    'selectWithout' => __('Select Without Transcript', 'ai-transcripts-for-podlove'),
                    'deselectAll' => __('Deselect All', 'ai-transcripts-for-podlove'),
                    'processing' => __('Processing...', 'ai-transcripts-for-podlove'),
                    'completed' => __('Completed', 'ai-transcripts-for-podlove'),
                    'failed' => __('Failed', 'ai-transcripts-for-podlove'),
                    'queued' => __('Queued', 'ai-transcripts-for-podlove'),
                    'idle' => __('Idle', 'ai-transcripts-for-podlove'),
                    'noEpisodes' => __('No episodes found.', 'ai-transcripts-for-podlove'),
                    'loading' => __('Loading episodes...', 'ai-transcripts-for-podlove'),
                    'batchProgress' => __('Processing %current% of %total%...', 'ai-transcripts-for-podlove'),
                    'batchDone' => __('Batch transcription complete.', 'ai-transcripts-for-podlove'),
                    'batchConfirmReplace' => __('The following episodes already have transcripts that will be replaced: %episodes%', 'ai-transcripts-for-podlove'),
                    'batchConfirmYes' => __('Replace and Continue', 'ai-transcripts-for-podlove'),
                    'batchConfirmNo' => __('Cancel', 'ai-transcripts-for-podlove'),
                    'yes' => __('Yes', 'ai-transcripts-for-podlove'),
                    'no' => __('No', 'ai-transcripts-for-podlove'),
                ],
            ]);
        }

        ?>
        <style>
            .ai-transcripts-for-podlove-key-status {
                display: inline-block;
                width: 24px;
                height: 24px;
                line-height: 24px;
                text-align: center;
                border-radius: 50%;
                font-size: 14px;
                font-weight: bold;
                vertical-align: middle;
                margin-left: 8px;
            }
            .ai-transcripts-for-podlove-key-valid {
                background: #00a32a;
                color: #fff;
            }
            .ai-transcripts-for-podlove-key-invalid {
                background: #d63638;
                color: #fff;
            }
            .ai-transcripts-for-podlove-key-error {
                background: #dba617;
                color: #fff;
            }
            .ai-transcripts-for-podlove-confirm {
                background: #fff8e5;
                border-left: 4px solid #dba617;
                padding: 12px 16px;
            }
            .ai-transcripts-for-podlove-confirm p {
                margin: 0 0 12px;
            }
            .ai-transcripts-for-podlove-api-key-details summary {
                cursor: pointer;
                font-size: 1.3em;
                font-weight: 600;
                padding: 8px 0;
            }
            .ai-transcripts-for-podlove-api-key-details summary::-webkit-details-marker {
                margin-right: 8px;
            }
        </style>
        <div class="wrap">
            <h1><?php esc_html_e('AI Transcripts for Podlove', 'ai-transcripts-for-podlove'); ?></h1>

            <?php settings_errors(self::OPTION_API_KEY); ?>

            <?php if ($has_key) : ?>
                <h2><?php esc_html_e('Batch Transcription', 'ai-transcripts-for-podlove'); ?></h2>
                <p class="description">
                    <?php esc_html_e('Select episodes to transcribe in batch. Episodes are processed one at a time.', 'ai-transcripts-for-podlove'); ?>
                </p>

                <div id="ai-transcripts-for-podlove-batch">
                    <p><em><?php esc_html_e('Loading episodes...', 'ai-transcripts-for-podlove'); ?></em></p>
                </div>

                <hr />

                <details class="ai-transcripts-for-podlove-api-key-details"<?php echo ($key_status !== 'valid') ? ' open' : ''; ?>>
                    <summary>
                        <?php esc_html_e('API Key', 'ai-transcripts-for-podlove'); ?>
                        <?php echo $this->render_key_status_indicator($key_status); ?>
                    </summary>

                    <form method="post" action="options.php">
                        <?php settings_fields('ai_transcripts'); ?>
                        <table class="form-table">
                            <tr>
                                <th scope="row">
                                    <label for="ai_transcripts_api_key"><?php esc_html_e('API Key', 'ai-transcripts-for-podlove'); ?></label>
                                </th>
                                <td>
                                    <input type="text" id="ai_transcripts_api_key" name="<?php echo esc_attr(self::OPTION_API_KEY); ?>"
                                           value="<?php echo esc_attr($api_key); ?>" class="regular-text" />
                                    <?php echo $this->render_key_status_indicator($key_status); ?>
                                    <p class="description">
                                        <?php
                                        printf(
                                            /* translators: %s: link to assemblyai.com */
                                            esc_html__('Get your API key at %s', 'ai-transcripts-for-podlove'),
                                            '<a href="https://www.assemblyai.com/" target="_blank" rel="noopener">assemblyai.com</a>'
                                        );
                                        ?>
                                    </p>
                                </td>
                            </tr>
                        </table>
                        <?php submit_button(__('Save', 'ai-transcripts-for-podlove')); ?>
                    </form>
                </details>
            <?php else : ?>
                <h2><?php esc_html_e('API Key', 'ai-transcripts-for-podlove'); ?></h2>

                <form method="post" action="options.php">
                    <?php settings_fields('ai_transcripts'); ?>
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="ai_transcripts_api_key"><?php esc_html_e('API Key', 'ai-transcripts-for-podlove'); ?></label>
                            </th>
                            <td>
                                <input type="text" id="ai_transcripts_api_key" name="<?php echo esc_attr(self::OPTION_API_KEY); ?>"
                                       value="<?php echo esc_attr($api_key); ?>" class="regular-text" />
                                <p class="description">
                                    <?php
                                    printf(
                                        /* translators: %s: link to assemblyai.com */
                                        esc_html__('Get your API key at %s', 'ai-transcripts-for-podlove'),
                                        '<a href="https://www.assemblyai.com/" target="_blank" rel="noopener">assemblyai.com</a>'
                                    );
                                    ?>
                                </p>
                            </td>
                        </tr>
                    </table>
                    <?php submit_button(__('Save', 'ai-transcripts-for-podlove')); ?>
                </form>
            <?php endif; ?>
        </div>
        <?php
    }
}
