<?php

namespace PodloveAssemblyAI;

class SettingsPage
{
    public const OPTION_API_KEY = 'podlove_assemblyai_api_key';
    public const MENU_SLUG = 'podlove-assemblyai';

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
            __('Podlove AssemblyAI', 'podlove-assemblyai'),
            __('AssemblyAI', 'podlove-assemblyai'),
            'edit_posts',
            self::MENU_SLUG,
            [$this, 'render_page']
        );
    }

    public function register_settings()
    {
        register_setting('podlove_assemblyai', self::OPTION_API_KEY, [
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
                __('Could not connect to AssemblyAI to verify the key. Key saved anyway.', 'podlove-assemblyai'),
                'warning'
            );
            return $value;
        }

        $code = wp_remote_retrieve_response_code($response);

        if ($code === 401) {
            add_settings_error(
                self::OPTION_API_KEY,
                'invalid_key',
                __('AssemblyAI rejected this API key. Please check it and try again.', 'podlove-assemblyai'),
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
                return '<span class="podlove-assemblyai-key-status podlove-assemblyai-key-valid" title="'
                    . esc_attr__('API key is valid', 'podlove-assemblyai')
                    . '">&#10003;</span>';
            case 'invalid':
                return '<span class="podlove-assemblyai-key-status podlove-assemblyai-key-invalid" title="'
                    . esc_attr__('API key is invalid', 'podlove-assemblyai')
                    . '">&#10007;</span>';
            case 'error':
                return '<span class="podlove-assemblyai-key-status podlove-assemblyai-key-error" title="'
                    . esc_attr__('Could not reach AssemblyAI to verify the key', 'podlove-assemblyai')
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
                'podlove-assemblyai-settings',
                PODLOVE_ASSEMBLYAI_URL . 'assets/js/settings.js',
                ['wp-api-fetch'],
                PODLOVE_ASSEMBLYAI_VERSION,
                true
            );

            wp_localize_script('podlove-assemblyai-settings', 'podloveAssemblyAISettings', [
                'restBase' => rest_url('podlove-assemblyai/v1'),
                'nonce' => wp_create_nonce('wp_rest'),
                'adminUrl' => admin_url(),
                'i18n' => [
                    'transcribe' => __('Transcribe Selected', 'podlove-assemblyai'),
                    'cancel' => __('Cancel', 'podlove-assemblyai'),
                    'selectAll' => __('Select All', 'podlove-assemblyai'),
                    'selectWithout' => __('Select Without Transcript', 'podlove-assemblyai'),
                    'deselectAll' => __('Deselect All', 'podlove-assemblyai'),
                    'processing' => __('Processing...', 'podlove-assemblyai'),
                    'completed' => __('Completed', 'podlove-assemblyai'),
                    'failed' => __('Failed', 'podlove-assemblyai'),
                    'queued' => __('Queued', 'podlove-assemblyai'),
                    'idle' => __('Idle', 'podlove-assemblyai'),
                    'noEpisodes' => __('No episodes found.', 'podlove-assemblyai'),
                    'loading' => __('Loading episodes...', 'podlove-assemblyai'),
                    'batchProgress' => __('Processing %current% of %total%...', 'podlove-assemblyai'),
                    'batchDone' => __('Batch transcription complete.', 'podlove-assemblyai'),
                    'batchConfirmReplace' => __('The following episodes already have transcripts that will be replaced: %episodes%', 'podlove-assemblyai'),
                    'batchConfirmYes' => __('Replace and Continue', 'podlove-assemblyai'),
                    'batchConfirmNo' => __('Cancel', 'podlove-assemblyai'),
                    'yes' => __('Yes', 'podlove-assemblyai'),
                    'no' => __('No', 'podlove-assemblyai'),
                ],
            ]);
        }

        ?>
        <style>
            .podlove-assemblyai-key-status {
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
            .podlove-assemblyai-key-valid {
                background: #00a32a;
                color: #fff;
            }
            .podlove-assemblyai-key-invalid {
                background: #d63638;
                color: #fff;
            }
            .podlove-assemblyai-key-error {
                background: #dba617;
                color: #fff;
            }
            .podlove-assemblyai-confirm {
                background: #fff8e5;
                border-left: 4px solid #dba617;
                padding: 12px 16px;
            }
            .podlove-assemblyai-confirm p {
                margin: 0 0 12px;
            }
            .podlove-assemblyai-api-key-details summary {
                cursor: pointer;
                font-size: 1.3em;
                font-weight: 600;
                padding: 8px 0;
            }
            .podlove-assemblyai-api-key-details summary::-webkit-details-marker {
                margin-right: 8px;
            }
        </style>
        <div class="wrap">
            <h1><?php esc_html_e('Podlove AssemblyAI', 'podlove-assemblyai'); ?></h1>

            <?php settings_errors(self::OPTION_API_KEY); ?>

            <?php if ($has_key) : ?>
                <h2><?php esc_html_e('Batch Transcription', 'podlove-assemblyai'); ?></h2>
                <p class="description">
                    <?php esc_html_e('Select episodes to transcribe in batch. Episodes are processed one at a time.', 'podlove-assemblyai'); ?>
                </p>

                <div id="podlove-assemblyai-batch">
                    <p><em><?php esc_html_e('Loading episodes...', 'podlove-assemblyai'); ?></em></p>
                </div>

                <hr />

                <details class="podlove-assemblyai-api-key-details"<?php echo ($key_status !== 'valid') ? ' open' : ''; ?>>
                    <summary>
                        <?php esc_html_e('API Key', 'podlove-assemblyai'); ?>
                        <?php echo $this->render_key_status_indicator($key_status); ?>
                    </summary>

                    <form method="post" action="options.php">
                        <?php settings_fields('podlove_assemblyai'); ?>
                        <table class="form-table">
                            <tr>
                                <th scope="row">
                                    <label for="podlove_assemblyai_api_key"><?php esc_html_e('API Key', 'podlove-assemblyai'); ?></label>
                                </th>
                                <td>
                                    <input type="text" id="podlove_assemblyai_api_key" name="<?php echo esc_attr(self::OPTION_API_KEY); ?>"
                                           value="<?php echo esc_attr($api_key); ?>" class="regular-text" />
                                    <?php echo $this->render_key_status_indicator($key_status); ?>
                                    <p class="description">
                                        <?php
                                        printf(
                                            /* translators: %s: link to assemblyai.com */
                                            esc_html__('Get your API key at %s', 'podlove-assemblyai'),
                                            '<a href="https://www.assemblyai.com/" target="_blank" rel="noopener">assemblyai.com</a>'
                                        );
                                        ?>
                                    </p>
                                </td>
                            </tr>
                        </table>
                        <?php submit_button(__('Save', 'podlove-assemblyai')); ?>
                    </form>
                </details>
            <?php else : ?>
                <h2><?php esc_html_e('API Key', 'podlove-assemblyai'); ?></h2>

                <form method="post" action="options.php">
                    <?php settings_fields('podlove_assemblyai'); ?>
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="podlove_assemblyai_api_key"><?php esc_html_e('API Key', 'podlove-assemblyai'); ?></label>
                            </th>
                            <td>
                                <input type="text" id="podlove_assemblyai_api_key" name="<?php echo esc_attr(self::OPTION_API_KEY); ?>"
                                       value="<?php echo esc_attr($api_key); ?>" class="regular-text" />
                                <p class="description">
                                    <?php
                                    printf(
                                        /* translators: %s: link to assemblyai.com */
                                        esc_html__('Get your API key at %s', 'podlove-assemblyai'),
                                        '<a href="https://www.assemblyai.com/" target="_blank" rel="noopener">assemblyai.com</a>'
                                    );
                                    ?>
                                </p>
                            </td>
                        </tr>
                    </table>
                    <?php submit_button(__('Save', 'podlove-assemblyai')); ?>
                </form>
            <?php endif; ?>
        </div>
        <?php
    }
}
