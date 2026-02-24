<?php

namespace PodloveAssemblyAI;

class SettingsPage
{
    public const OPTION_API_KEY = 'podlove_assemblyai_api_key';
    public const MENU_SLUG = 'podlove-assemblyai';

    public function __construct()
    {
        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_init', [$this, 'register_settings']);
    }

    public function add_menu_page()
    {
        // Add as submenu under Podlove if available, otherwise under Settings
        global $admin_page_hooks;
        $parent = isset($admin_page_hooks['podlove']) ? 'podlove' : 'options-general.php';

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


    public function render_page()
    {
        $api_key = get_option(self::OPTION_API_KEY, '');
        $has_key = !empty($api_key);

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
                    'yes' => __('Yes', 'podlove-assemblyai'),
                    'no' => __('No', 'podlove-assemblyai'),
                ],
            ]);
        }

        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Podlove AssemblyAI', 'podlove-assemblyai'); ?></h1>

            <?php settings_errors(self::OPTION_API_KEY); ?>

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

            <?php if ($has_key) : ?>
                <hr />
                <h2><?php esc_html_e('Batch Transcription', 'podlove-assemblyai'); ?></h2>
                <p class="description">
                    <?php esc_html_e('Select episodes to transcribe in batch. Episodes are processed one at a time.', 'podlove-assemblyai'); ?>
                </p>

                <div id="podlove-assemblyai-batch">
                    <p><em><?php esc_html_e('Loading episodes...', 'podlove-assemblyai'); ?></em></p>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }
}
