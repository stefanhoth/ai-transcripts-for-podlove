<?php
/**
 * Plugin Name: AI Transcripts for Podlove
 * Plugin URI: https://github.com/stefanhoth/ai-transcripts-for-podlove
 * Description: Generate transcripts for Podlove Publisher episodes using AssemblyAI. One-click transcription with speaker diarization, imported directly into the Transcripts module.
 * Version: 1.0.10
 * Requires at least: 6.0
 * Requires PHP: 8.4
 * Author: Stefan Hoth
 * Author URI: https://stefanhoth.com
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 * Text Domain: ai-transcripts-for-podlove
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AI_TRANSCRIPTS_VERSION', '1.0.10');
define('AI_TRANSCRIPTS_FILE', __FILE__);
define('AI_TRANSCRIPTS_DIR', plugin_dir_path(__FILE__));
define('AI_TRANSCRIPTS_URL', plugin_dir_url(__FILE__));


require_once AI_TRANSCRIPTS_DIR . 'inc/VttConverter.php';
require_once AI_TRANSCRIPTS_DIR . 'inc/RestApi.php';
require_once AI_TRANSCRIPTS_DIR . 'inc/MetaBox.php';
require_once AI_TRANSCRIPTS_DIR . 'inc/SettingsPage.php';

/**
 * Check if Podlove Publisher is active with the required modules.
 *
 * Returns an empty array when all dependencies are met, or a list of
 * human-readable problems otherwise.
 */
function ai_transcripts_check_dependencies() {
    $problems = [];

    if (!class_exists('\\Podlove\\Model\\Episode')) {
        $problems[] = 'Podlove Publisher is not active.';
        return $problems;
    }

    if (!class_exists('\\Podlove\\Modules\\Base')) {
        $problems[] = 'Podlove Publisher module system not found.';
        return $problems;
    }

    if (!\Podlove\Modules\Base::is_active('transcripts')) {
        $problems[] = 'The Podlove "Transcripts" module must be enabled.';
    }

    if (!\Podlove\Modules\Base::is_active('contributors')) {
        $problems[] = 'The Podlove "Contributors" module must be enabled (required by Transcripts).';
    }

    return $problems;
}

/**
 * Show admin notice when dependencies are not met.
 */
function ai_transcripts_missing_dependency_notice() {
    $problems = ai_transcripts_check_dependencies();

    if (empty($problems)) {
        return;
    }

    echo '<div class="notice notice-error"><p>';
    echo '<strong>' . esc_html__('AI Transcripts for Podlove', 'ai-transcripts-for-podlove') . ':</strong> ';
    echo esc_html(implode(' ', $problems));
    echo '</p></div>';
}
add_action('admin_notices', 'ai_transcripts_missing_dependency_notice');

/**
 * Initialize the plugin after all plugins have loaded.
 */
function ai_transcripts_init() {
    if (!empty(ai_transcripts_check_dependencies())) {
        return;
    }

    load_plugin_textdomain('ai-transcripts-for-podlove', false, dirname(plugin_basename(__FILE__)) . '/languages');

    add_action('rest_api_init', function () {
        $api = new AiTranscriptsForPodlove\RestApi();
        $api->register_routes();
    });

    new AiTranscriptsForPodlove\MetaBox();
    new AiTranscriptsForPodlove\SettingsPage();
}
add_action('plugins_loaded', 'ai_transcripts_init', 20);

/**
 * Add a Settings link to the plugin's entry on the Plugins page.
 *
 * @param array $links Existing action links.
 * @return array Modified action links with Settings prepended.
 */
function ai_transcripts_add_plugin_action_links( $links ) {
    if ( ! empty( ai_transcripts_check_dependencies() ) ) {
        return $links;
    }
    $settings_link = sprintf(
        '<a href="%s">%s</a>',
        esc_url( admin_url( 'admin.php?page=' . AiTranscriptsForPodlove\SettingsPage::MENU_SLUG ) ),
        esc_html__( 'Settings', 'ai-transcripts-for-podlove' )
    );
    array_unshift( $links, $settings_link );
    return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'ai_transcripts_add_plugin_action_links' );
