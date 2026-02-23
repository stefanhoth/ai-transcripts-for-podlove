<?php

namespace PodloveAssemblyAI;

class MetaBox
{
    public function __construct()
    {
        add_action('add_meta_boxes_podcast', [$this, 'register']);
    }

    public function register()
    {
        $api_key = get_option('podlove_assemblyai_api_key', '');

        if (empty($api_key)) {
            return;
        }

        add_meta_box(
            'podlove-assemblyai',
            __('AssemblyAI Transcription', 'podlove-assemblyai'),
            [$this, 'render'],
            'podcast',
            'normal',
            'default'
        );
    }

    public function render($post)
    {
        $transcript_id = get_post_meta($post->ID, 'assemblyai_transcript_id', true);
        $status = get_post_meta($post->ID, 'assemblyai_status', true);

        wp_enqueue_style(
            'podlove-assemblyai-metabox',
            PODLOVE_ASSEMBLYAI_URL . 'assets/css/metabox.css',
            [],
            PODLOVE_ASSEMBLYAI_VERSION
        );

        wp_enqueue_script(
            'podlove-assemblyai-metabox',
            PODLOVE_ASSEMBLYAI_URL . 'assets/js/metabox.js',
            ['wp-api-fetch'],
            PODLOVE_ASSEMBLYAI_VERSION,
            true
        );

        wp_localize_script('podlove-assemblyai-metabox', 'podloveAssemblyAI', [
            'postId' => $post->ID,
            'restBase' => rest_url('podlove-assemblyai/v1'),
            'nonce' => wp_create_nonce('wp_rest'),
            'initialStatus' => $status ?: 'idle',
            'transcriptId' => $transcript_id ?: '',
            'i18n' => [
                'startTranscription' => __('Start Transcription', 'podlove-assemblyai'),
                'submitting' => __('Submitting to AssemblyAI...', 'podlove-assemblyai'),
                'transcribing' => __('Transcribing...', 'podlove-assemblyai'),
                'importing' => __('Importing transcript...', 'podlove-assemblyai'),
                'imported' => __('Transcript imported successfully.', 'podlove-assemblyai'),
                'error' => __('An error occurred.', 'podlove-assemblyai'),
                'retry' => __('Retry', 'podlove-assemblyai'),
                'transcribeAgain' => __('Transcribe Again', 'podlove-assemblyai'),
                'noAudio' => __('No active audio files available for this episode.', 'podlove-assemblyai'),
                'confirmReplace' => __('This episode already has a transcript. Starting a new transcription will replace it. Continue?', 'podlove-assemblyai'),
                'queued' => __('queued', 'podlove-assemblyai'),
                'processing' => __('processing', 'podlove-assemblyai'),
            ],
        ]);

        echo '<div id="podlove-assemblyai-metabox"></div>';
    }
}
