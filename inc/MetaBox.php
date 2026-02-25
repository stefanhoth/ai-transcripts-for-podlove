<?php

namespace AiTranscriptsForPodlove;

class MetaBox
{
    public function __construct()
    {
        add_action('add_meta_boxes_podcast', [$this, 'register']);
    }

    public function register()
    {
        $api_key = get_option('ai_transcripts_api_key', '');

        if (empty($api_key)) {
            return;
        }

        add_meta_box(
            'ai-transcripts-for-podlove',
            __('AssemblyAI Transcription', 'ai-transcripts-for-podlove'),
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
            'ai-transcripts-for-podlove-metabox',
            AI_TRANSCRIPTS_URL . 'assets/css/metabox.css',
            [],
            AI_TRANSCRIPTS_VERSION
        );

        wp_enqueue_script(
            'ai-transcripts-for-podlove-metabox',
            AI_TRANSCRIPTS_URL . 'assets/js/metabox.js',
            ['wp-api-fetch'],
            AI_TRANSCRIPTS_VERSION,
            true
        );

        wp_localize_script('ai-transcripts-for-podlove-metabox', 'aiTranscripts', [
            'postId' => $post->ID,
            'restBase' => rest_url('ai-transcripts-for-podlove/v1'),
            'nonce' => wp_create_nonce('wp_rest'),
            'initialStatus' => $status ?: 'idle',
            'transcriptId' => $transcript_id ?: '',
            'i18n' => [
                'startTranscription' => __('Start Transcription', 'ai-transcripts-for-podlove'),
                'submitting' => __('Submitting to AssemblyAI...', 'ai-transcripts-for-podlove'),
                'transcribing' => __('Transcribing...', 'ai-transcripts-for-podlove'),
                'importing' => __('Importing transcript...', 'ai-transcripts-for-podlove'),
                'imported' => __('Transcript imported successfully.', 'ai-transcripts-for-podlove'),
                'error' => __('An error occurred.', 'ai-transcripts-for-podlove'),
                'retry' => __('Retry', 'ai-transcripts-for-podlove'),
                'transcribeAgain' => __('Transcribe Again', 'ai-transcripts-for-podlove'),
                'noAudio' => __('No active audio files available for this episode.', 'ai-transcripts-for-podlove'),
                'confirmReplace' => __('This episode already has a transcript. Starting a new transcription will replace it.', 'ai-transcripts-for-podlove'),
                'confirmYes' => __('Replace Transcript', 'ai-transcripts-for-podlove'),
                'confirmNo' => __('Cancel', 'ai-transcripts-for-podlove'),
                'queued' => __('queued', 'ai-transcripts-for-podlove'),
                'processing' => __('processing', 'ai-transcripts-for-podlove'),
            ],
        ]);

        echo '<div id="ai-transcripts-for-podlove-metabox"></div>';
    }
}
