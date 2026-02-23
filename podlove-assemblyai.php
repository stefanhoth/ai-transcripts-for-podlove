<?php
/**
 * Plugin Name: Podlove AssemblyAI
 * Plugin URI: https://github.com/stefanhoth/podlove-assemblyai
 * Description: Generate transcripts for Podlove Publisher episodes using AssemblyAI. One-click transcription with speaker diarization, imported directly into the Transcripts module.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Stefan Hoth
 * Author URI: https://stefanhoth.com
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 * Text Domain: podlove-assemblyai
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PODLOVE_ASSEMBLYAI_VERSION', '1.0.0');
define('PODLOVE_ASSEMBLYAI_FILE', __FILE__);
define('PODLOVE_ASSEMBLYAI_DIR', plugin_dir_path(__FILE__));
define('PODLOVE_ASSEMBLYAI_URL', plugin_dir_url(__FILE__));

require_once PODLOVE_ASSEMBLYAI_DIR . 'inc/VttConverter.php';
require_once PODLOVE_ASSEMBLYAI_DIR . 'inc/RestApi.php';
require_once PODLOVE_ASSEMBLYAI_DIR . 'inc/MetaBox.php';
require_once PODLOVE_ASSEMBLYAI_DIR . 'inc/SettingsPage.php';

/**
 * Check if Podlove Publisher is active and has the Transcripts module enabled.
 */
function podlove_assemblyai_check_dependencies() {
    return class_exists('\\Podlove\\Model\\Episode')
        && class_exists('\\Podlove\\Modules\\Transcripts\\Transcripts');
}

/**
 * Show admin notice when Podlove Publisher is not active.
 */
function podlove_assemblyai_missing_dependency_notice() {
    if (podlove_assemblyai_check_dependencies()) {
        return;
    }

    $message = __('Podlove AssemblyAI requires Podlove Publisher with the Transcripts module enabled.', 'podlove-assemblyai');
    printf('<div class="notice notice-error"><p>%s</p></div>', esc_html($message));
}
add_action('admin_notices', 'podlove_assemblyai_missing_dependency_notice');

/**
 * Initialize the plugin after all plugins have loaded.
 */
function podlove_assemblyai_init() {
    if (!podlove_assemblyai_check_dependencies()) {
        return;
    }

    load_plugin_textdomain('podlove-assemblyai', false, dirname(plugin_basename(__FILE__)) . '/languages');

    add_action('rest_api_init', function () {
        $api = new PodloveAssemblyAI\RestApi();
        $api->register_routes();
    });

    new PodloveAssemblyAI\MetaBox();
    new PodloveAssemblyAI\SettingsPage();
}
add_action('plugins_loaded', 'podlove_assemblyai_init', 20);
