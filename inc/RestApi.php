<?php

namespace PodloveAssemblyAI;

use Podlove\Model\Episode;
use Podlove\Model\EpisodeAsset;
use Podlove\Modules\Transcripts\Transcripts;

class RestApi
{
    public const API_NAMESPACE = 'podlove-assemblyai/v1';
    public const ASSEMBLYAI_BASE_URL = 'https://api.assemblyai.com/v2';

    public function register_routes()
    {
        register_rest_route(self::API_NAMESPACE, '/config', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'get_config'],
                'permission_callback' => [$this, 'permission_check'],
            ],
        ]);

        register_rest_route(self::API_NAMESPACE, '/episodes', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'get_episodes'],
                'permission_callback' => [$this, 'permission_check'],
            ],
        ]);

        register_rest_route(self::API_NAMESPACE, '/transcribe/(?P<post_id>[0-9]+)', [
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'start_transcription'],
                'permission_callback' => [$this, 'permission_check_post'],
                'args' => [
                    'post_id' => [
                        'required' => true,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);

        register_rest_route(self::API_NAMESPACE, '/status/(?P<post_id>[0-9]+)', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'get_status'],
                'permission_callback' => [$this, 'permission_check_post'],
                'args' => [
                    'post_id' => [
                        'required' => true,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);

        register_rest_route(self::API_NAMESPACE, '/import/(?P<post_id>[0-9]+)', [
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'import_transcript'],
                'permission_callback' => [$this, 'permission_check_post'],
                'args' => [
                    'post_id' => [
                        'required' => true,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);
    }

    public function permission_check()
    {
        if (!current_user_can('edit_posts')) {
            return new \WP_Error(
                'rest_forbidden',
                'Sorry, you are not allowed to do that.',
                ['status' => 403]
            );
        }

        return true;
    }

    public function permission_check_post(\WP_REST_Request $request)
    {
        $post_id = (int) $request->get_param('post_id');

        if (!current_user_can('edit_post', $post_id)) {
            return new \WP_Error(
                'rest_forbidden',
                'Sorry, you are not allowed to edit this post.',
                ['status' => 403]
            );
        }

        return true;
    }

    public function get_config(\WP_REST_Request $request)
    {
        $api_key = get_option('podlove_assemblyai_api_key', '');

        $result = [
            'has_api_key' => !empty($api_key),
        ];

        // Optionally check transcript existence for a specific post
        $post_id = $request->get_param('post_id');
        if ($post_id) {
            $post_id = absint($post_id);
            $episode = Episode::find_or_create_by_post_id($post_id);
            $result['has_transcript'] = $episode
                ? (bool) \Podlove\Modules\Transcripts\Model\Transcript::exists_for_episode($episode->id)
                : false;
        }

        return new \WP_REST_Response($result);
    }

    public function get_episodes()
    {
        $posts = get_posts([
            'post_type' => 'podcast',
            'post_status' => 'publish',
            'numberposts' => -1,
            'orderby' => 'date',
            'order' => 'DESC',
        ]);

        $episodes = [];

        foreach ($posts as $post) {
            $episode = Episode::find_or_create_by_post_id($post->ID);

            $has_audio = false;
            $has_transcript = false;
            $assemblyai_status = get_post_meta($post->ID, 'assemblyai_status', true);

            if ($episode) {
                $has_audio = $this->episode_has_audio($episode);
                $has_transcript = \Podlove\Modules\Transcripts\Model\Transcript::exists_for_episode($episode->id);
            }

            $episodes[] = [
                'post_id' => $post->ID,
                'title' => get_the_title($post->ID),
                'has_audio' => $has_audio,
                'has_transcript' => (bool) $has_transcript,
                'assemblyai_status' => $assemblyai_status ?: null,
            ];
        }

        return new \WP_REST_Response($episodes);
    }

    public function start_transcription(\WP_REST_Request $request)
    {
        $post_id = (int) $request->get_param('post_id');
        $api_key = get_option('podlove_assemblyai_api_key', '');

        if (empty($api_key)) {
            return new \WP_REST_Response(['error' => 'API key not configured'], 400);
        }

        $episode = Episode::find_or_create_by_post_id($post_id);
        if (!$episode) {
            return new \WP_REST_Response(['error' => 'Episode not found'], 404);
        }

        $audio_url = $this->get_audio_url($episode);
        if (!$audio_url) {
            return new \WP_REST_Response(['error' => 'No active audio file found for this episode'], 400);
        }

        $payload = [
            'audio_url' => $audio_url,
            'speech_model' => 'best',
            'speaker_labels' => true,
            'language_detection' => true,
        ];

        // Add speaker count hint from Contributors module
        $speakers_expected = $this->get_speakers_expected($episode);
        if ($speakers_expected > 0) {
            $payload['speakers_expected'] = $speakers_expected;
        }

        $response = wp_remote_post(self::ASSEMBLYAI_BASE_URL.'/transcript', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => $api_key,
            ],
            'body' => wp_json_encode($payload),
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return new \WP_REST_Response(['error' => 'Failed to submit transcription to AssemblyAI'], 500);
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $raw_body = wp_remote_retrieve_body($response);

        if ($status_code < 200 || $status_code >= 300) {
            $error = 'Failed to submit transcription to AssemblyAI';
            $body = json_decode($raw_body, true);
            if (is_array($body) && isset($body['error'])) {
                $error = $body['error'];
            }

            return new \WP_REST_Response(['error' => $error], 500);
        }

        $body = json_decode($raw_body, true);

        if (!is_array($body) || !isset($body['id'], $body['status'])) {
            return new \WP_REST_Response(['error' => 'Unexpected response from AssemblyAI'], 500);
        }

        $transcript_id = sanitize_text_field($body['id']);

        update_post_meta($post_id, 'assemblyai_transcript_id', $transcript_id);
        update_post_meta($post_id, 'assemblyai_status', $body['status']);

        return new \WP_REST_Response([
            'transcript_id' => $transcript_id,
            'status' => $body['status'],
        ]);
    }

    public function get_status(\WP_REST_Request $request)
    {
        $post_id = (int) $request->get_param('post_id');
        $api_key = get_option('podlove_assemblyai_api_key', '');

        if (empty($api_key)) {
            return new \WP_REST_Response(['error' => 'API key not configured'], 400);
        }

        $transcript_id = $this->get_valid_transcript_id($post_id);
        if (!$transcript_id) {
            return new \WP_REST_Response(['error' => 'No transcription found for this episode'], 404);
        }

        $response = wp_remote_get(self::ASSEMBLYAI_BASE_URL.'/transcript/'.$transcript_id, [
            'headers' => [
                'Authorization' => $api_key,
            ],
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return new \WP_REST_Response(['error' => 'Failed to fetch transcription status'], 500);
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code < 200 || $status_code >= 300) {
            return new \WP_REST_Response(['error' => 'Failed to fetch transcription status'], 500);
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (!is_array($body) || !isset($body['status'])) {
            return new \WP_REST_Response(['error' => 'Unexpected response from AssemblyAI'], 500);
        }

        $status = $body['status'];

        update_post_meta($post_id, 'assemblyai_status', $status);

        $result = ['status' => $status];

        if ($status === 'error' && isset($body['error'])) {
            $result['error'] = $body['error'];
        }

        return new \WP_REST_Response($result);
    }

    public function import_transcript(\WP_REST_Request $request)
    {
        $post_id = (int) $request->get_param('post_id');
        $api_key = get_option('podlove_assemblyai_api_key', '');

        if (empty($api_key)) {
            return new \WP_REST_Response(['error' => 'API key not configured'], 400);
        }

        $transcript_id = $this->get_valid_transcript_id($post_id);
        if (!$transcript_id) {
            return new \WP_REST_Response(['error' => 'No transcription found for this episode'], 404);
        }

        $episode = Episode::find_or_create_by_post_id($post_id);
        if (!$episode) {
            return new \WP_REST_Response(['error' => 'Episode not found'], 404);
        }

        // Fetch full transcript from AssemblyAI
        $response = wp_remote_get(self::ASSEMBLYAI_BASE_URL.'/transcript/'.$transcript_id, [
            'headers' => [
                'Authorization' => $api_key,
            ],
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return new \WP_REST_Response(['error' => 'Failed to fetch transcript from AssemblyAI'], 500);
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code < 200 || $status_code >= 300) {
            return new \WP_REST_Response(['error' => 'Failed to fetch transcript from AssemblyAI'], 500);
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (!is_array($body) || !isset($body['status'])) {
            return new \WP_REST_Response(['error' => 'Unexpected response from AssemblyAI'], 500);
        }

        if ($body['status'] !== 'completed') {
            return new \WP_REST_Response(['error' => 'Transcript is not yet completed'], 400);
        }

        // Convert to WebVTT
        $vtt_content = VttConverter::convert($body);

        // Import via existing Transcripts module
        Transcripts::parse_and_import_webvtt($episode, $vtt_content);

        // Update status
        update_post_meta($post_id, 'assemblyai_status', 'imported');

        return new \WP_REST_Response(['success' => true]);
    }

    /**
     * Get and validate transcript ID from post meta.
     *
     * @param int $post_id
     *
     * @return string|null valid transcript ID or null
     */
    private function get_valid_transcript_id($post_id)
    {
        $transcript_id = get_post_meta($post_id, 'assemblyai_transcript_id', true);

        if (empty($transcript_id)) {
            return null;
        }

        // AssemblyAI IDs are alphanumeric with hyphens
        if (!preg_match('/^[a-zA-Z0-9\-]+$/', $transcript_id)) {
            return null;
        }

        return $transcript_id;
    }

    /**
     * Find the first active audio media file URL for an episode.
     *
     * @param mixed $episode
     *
     * @return string|null audio URL or null
     */
    private function get_audio_url($episode)
    {
        $media_files = $episode->media_files();

        foreach ($media_files as $file) {
            if (!$file->active || $file->size <= 0) {
                continue;
            }

            $asset = EpisodeAsset::find_by_id($file->episode_asset_id);
            if (!$asset) {
                continue;
            }

            $file_type = $asset->file_type();
            if ($file_type && $file_type->type === 'audio') {
                return $file->get_file_url();
            }
        }

        return null;
    }

    /**
     * Check whether an episode has any active audio media files.
     *
     * @param mixed $episode
     *
     * @return bool
     */
    private function episode_has_audio($episode)
    {
        return $this->get_audio_url($episode) !== null;
    }

    /**
     * Get expected speaker count from Contributors module.
     *
     * @param mixed $episode
     *
     * @return int
     */
    private function get_speakers_expected($episode)
    {
        if (!\Podlove\Modules\Base::is_active('contributors')) {
            return 0;
        }

        $contributions = \Podlove\Modules\Contributors\Model\EpisodeContribution::find_all_by_episode_id($episode->id);

        if (empty($contributions)) {
            return 0;
        }

        return count($contributions);
    }
}
