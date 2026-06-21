<?php
/**
 * REST API endpoints for the AI Transcripts for Podlove plugin.
 *
 * @package AiTranscriptsForPodlove
 */

namespace AiTranscriptsForPodlove;

use Podlove\Model\Episode;
use Podlove\Model\EpisodeAsset;
use Podlove\Modules\Transcripts\Transcripts;

class RestApi {

	public const API_NAMESPACE       = 'ai-transcripts-for-podlove/v1';
	public const ASSEMBLYAI_BASE_URL = 'https://api.assemblyai.com/v2';
	private const VALID_STATUSES     = array( 'queued', 'processing', 'completed', 'error' );

	public function register_routes() {
		register_rest_route(
			self::API_NAMESPACE,
			'/config',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_config' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);

		register_rest_route(
			self::API_NAMESPACE,
			'/episodes',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_episodes' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);

		register_rest_route(
			self::API_NAMESPACE,
			'/transcribe/(?P<post_id>[0-9]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'start_transcription' ),
					'permission_callback' => array( $this, 'permission_check_post' ),
					'args'                => array(
						'post_id' => array(
							'required'          => true,
							'type'              => 'integer',
							'sanitize_callback' => 'absint',
						),
					),
				),
			)
		);

		register_rest_route(
			self::API_NAMESPACE,
			'/status/(?P<post_id>[0-9]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_status' ),
					'permission_callback' => array( $this, 'permission_check_post' ),
					'args'                => array(
						'post_id' => array(
							'required'          => true,
							'type'              => 'integer',
							'sanitize_callback' => 'absint',
						),
					),
				),
			)
		);

		register_rest_route(
			self::API_NAMESPACE,
			'/import/(?P<post_id>[0-9]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'import_transcript' ),
					'permission_callback' => array( $this, 'permission_check_post' ),
					'args'                => array(
						'post_id' => array(
							'required'          => true,
							'type'              => 'integer',
							'sanitize_callback' => 'absint',
						),
					),
				),
			)
		);
	}

	public function permission_check() {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return new \WP_Error(
				'rest_forbidden',
				'Sorry, you are not allowed to do that.',
				array( 'status' => 403 )
			);
		}

		return true;
	}

	public function permission_check_post( \WP_REST_Request $request ) {
		$post_id = (int) $request->get_param( 'post_id' );

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new \WP_Error(
				'rest_forbidden',
				'Sorry, you are not allowed to edit this post.',
				array( 'status' => 403 )
			);
		}

		return true;
	}

	public function get_config( \WP_REST_Request $request ) {
		$api_key = get_option( 'ai_transcripts_api_key', '' );

		$result = array(
			'has_api_key' => ! empty( $api_key ),
		);

		// Optionally check transcript existence for a specific post
		$post_id = $request->get_param( 'post_id' );
		if ( $post_id ) {
			$post_id                  = absint( $post_id );
			$episode                  = Episode::find_one_by_property( 'post_id', $post_id );
			$result['has_transcript'] = $episode
				? (bool) \Podlove\Modules\Transcripts\Model\Transcript::exists_for_episode( $episode->id )
				: false;
		}

		return new \WP_REST_Response( $result );
	}

	public function get_episodes() {
		$posts = get_posts(
			array(
				'post_type'   => 'podcast',
				'post_status' => 'publish',
				'numberposts' => -1,
				'orderby'     => 'date',
				'order'       => 'DESC',
			)
		);

		$episodes = array();

		foreach ( $posts as $post ) {
			$episode = Episode::find_one_by_property( 'post_id', $post->ID );

			$has_audio         = false;
			$has_transcript    = false;
			$assemblyai_status = get_post_meta( $post->ID, 'assemblyai_status', true );

			$url_error = null;

			if ( $episode ) {
				$audio_url      = $this->get_audio_url( $episode );
				$has_audio      = $audio_url !== null;
				$has_transcript = \Podlove\Modules\Transcripts\Model\Transcript::exists_for_episode( $episode->id );

				if ( $has_audio ) {
					$url_error = $this->validate_public_url( $audio_url );
				}
			}

			$episodes[] = array(
				'post_id'           => $post->ID,
				'title'             => get_the_title( $post->ID ),
				'has_audio'         => $has_audio,
				'has_transcript'    => (bool) $has_transcript,
				'assemblyai_status' => $assemblyai_status ?: null,
				'url_error'         => $url_error,
			);
		}

		return new \WP_REST_Response( $episodes );
	}

	public function start_transcription( \WP_REST_Request $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$api_key = get_option( 'ai_transcripts_api_key', '' );

		if ( empty( $api_key ) ) {
			return new \WP_REST_Response( array( 'error' => 'API key not configured' ), 400 );
		}

		$episode = Episode::find_or_create_by_post_id( $post_id );
		if ( ! $episode ) {
			return new \WP_REST_Response( array( 'error' => 'Episode not found' ), 404 );
		}

		$audio_url = $this->get_audio_url( $episode );
		if ( ! $audio_url ) {
			return new \WP_REST_Response( array( 'error' => 'No active audio file found for this episode' ), 400 );
		}

		$url_error = $this->validate_public_url( $audio_url );
		if ( $url_error ) {
			return new \WP_REST_Response( array( 'error' => $url_error ), 400 );
		}

		$payload = array(
			'audio_url'          => $audio_url,
			'speech_model'       => 'best',
			'speaker_labels'     => true,
			'language_detection' => true,
		);

		// Add speaker count hint from Contributors module
		$speakers_expected = $this->get_speakers_expected( $episode );
		if ( $speakers_expected > 0 ) {
			$payload['speakers_expected'] = $speakers_expected;
		}

		$response = wp_remote_post(
			self::ASSEMBLYAI_BASE_URL . '/transcript',
			array(
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => $api_key,
				),
				'body'    => wp_json_encode( $payload ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new \WP_REST_Response( array( 'error' => 'Failed to submit transcription to AssemblyAI' ), 500 );
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$raw_body    = wp_remote_retrieve_body( $response );

		if ( $status_code < 200 || $status_code >= 300 ) {
			$error = 'Failed to submit transcription to AssemblyAI';
			$body  = json_decode( $raw_body, true );
			if ( is_array( $body ) && isset( $body['error'] ) ) {
				$error = sanitize_text_field( $body['error'] );
			}

			return new \WP_REST_Response( array( 'error' => $error ), 500 );
		}

		$body = json_decode( $raw_body, true );

		if ( ! is_array( $body ) || ! isset( $body['id'], $body['status'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unexpected response from AssemblyAI' ), 500 );
		}

		$transcript_id = sanitize_text_field( $body['id'] );

		$status = $this->sanitize_assemblyai_status( $body['status'] );

		update_post_meta( $post_id, 'assemblyai_transcript_id', $transcript_id );
		update_post_meta( $post_id, 'assemblyai_status', $status );

		return new \WP_REST_Response(
			array(
				'transcript_id' => $transcript_id,
				'status'        => $status,
			)
		);
	}

	public function get_status( \WP_REST_Request $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$api_key = get_option( 'ai_transcripts_api_key', '' );

		if ( empty( $api_key ) ) {
			return new \WP_REST_Response( array( 'error' => 'API key not configured' ), 400 );
		}

		$transcript_id = $this->get_valid_transcript_id( $post_id );
		if ( ! $transcript_id ) {
			return new \WP_REST_Response( array( 'error' => 'No transcription found for this episode' ), 404 );
		}

		$response = wp_remote_get(
			self::ASSEMBLYAI_BASE_URL . '/transcript/' . $transcript_id,
			array(
				'headers' => array(
					'Authorization' => $api_key,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new \WP_REST_Response( array( 'error' => 'Failed to fetch transcription status' ), 500 );
		}

		$status_code = wp_remote_retrieve_response_code( $response );

		if ( $status_code < 200 || $status_code >= 300 ) {
			return new \WP_REST_Response( array( 'error' => 'Failed to fetch transcription status' ), 500 );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! is_array( $body ) || ! isset( $body['status'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unexpected response from AssemblyAI' ), 500 );
		}

		$status = $this->sanitize_assemblyai_status( $body['status'] );

		update_post_meta( $post_id, 'assemblyai_status', $status );

		$result = array( 'status' => $status );

		if ( $status === 'error' && isset( $body['error'] ) ) {
			$result['error'] = sanitize_text_field( $body['error'] );
		}

		return new \WP_REST_Response( $result );
	}

	public function import_transcript( \WP_REST_Request $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$api_key = get_option( 'ai_transcripts_api_key', '' );

		if ( empty( $api_key ) ) {
			return new \WP_REST_Response( array( 'error' => 'API key not configured' ), 400 );
		}

		$transcript_id = $this->get_valid_transcript_id( $post_id );
		if ( ! $transcript_id ) {
			return new \WP_REST_Response( array( 'error' => 'No transcription found for this episode' ), 404 );
		}

		$episode = Episode::find_or_create_by_post_id( $post_id );
		if ( ! $episode ) {
			return new \WP_REST_Response( array( 'error' => 'Episode not found' ), 404 );
		}

		// Fetch full transcript from AssemblyAI
		$response = wp_remote_get(
			self::ASSEMBLYAI_BASE_URL . '/transcript/' . $transcript_id,
			array(
				'headers' => array(
					'Authorization' => $api_key,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new \WP_REST_Response( array( 'error' => 'Failed to fetch transcript from AssemblyAI' ), 500 );
		}

		$status_code = wp_remote_retrieve_response_code( $response );

		if ( $status_code < 200 || $status_code >= 300 ) {
			return new \WP_REST_Response( array( 'error' => 'Failed to fetch transcript from AssemblyAI' ), 500 );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! is_array( $body ) || ! isset( $body['status'] ) ) {
			return new \WP_REST_Response( array( 'error' => 'Unexpected response from AssemblyAI' ), 500 );
		}

		if ( $body['status'] !== 'completed' ) {
			return new \WP_REST_Response( array( 'error' => 'Transcript is not yet completed' ), 400 );
		}

		// Convert to WebVTT
		$vtt_content = VttConverter::convert( $body );

		// Import via existing Transcripts module
		Transcripts::parse_and_import_webvtt( $episode, $vtt_content );

		// Update status
		update_post_meta( $post_id, 'assemblyai_status', 'imported' );

		return new \WP_REST_Response( array( 'success' => true ) );
	}

	/**
	 * Get and validate transcript ID from post meta.
	 *
	 * @param int $post_id
	 *
	 * @return string|null valid transcript ID or null
	 */
	private function get_valid_transcript_id( $post_id ) {
		$transcript_id = get_post_meta( $post_id, 'assemblyai_transcript_id', true );

		if ( empty( $transcript_id ) ) {
			return null;
		}

		// AssemblyAI IDs are alphanumeric with hyphens
		if ( ! preg_match( '/^[a-zA-Z0-9\-]+$/', $transcript_id ) ) {
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
	private function get_audio_url( $episode ) {
		$media_files = $episode->media_files();

		foreach ( $media_files as $file ) {
			if ( ! $file->active || $file->size <= 0 ) {
				continue;
			}

			$asset = EpisodeAsset::find_by_id( $file->episode_asset_id );
			if ( ! $asset ) {
				continue;
			}

			$file_type = $asset->file_type();
			if ( $file_type && $file_type->type === 'audio' ) {
				return $file->get_file_url();
			}
		}

		return null;
	}

	/**
	 * Check that a URL is publicly reachable by AssemblyAI.
	 *
	 * Returns an error message string if the URL is invalid, or null if OK.
	 *
	 * @param string $url
	 *
	 * @return string|null error message or null
	 */
	private function validate_public_url( $url ) {
		$parsed = wp_parse_url( $url );

		if ( ! $parsed || empty( $parsed['scheme'] ) || empty( $parsed['host'] ) ) {
			return 'Audio URL is not a valid URL.';
		}

		if ( ! in_array( $parsed['scheme'], array( 'http', 'https' ), true ) ) {
			return 'Audio URL must use http or https.';
		}

		$host = strtolower( $parsed['host'] );

		if ( $host === 'localhost' || str_ends_with( $host, '.local' ) || str_ends_with( $host, '.internal' ) ) {
			return 'Audio URL points to a local address that AssemblyAI cannot reach.';
		}

		// Resolve hostname and reject private/reserved IP ranges.
		$ip = gethostbyname( $host );
		if ( $ip !== $host && ! filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
			return 'Audio URL resolves to a private or reserved IP address that AssemblyAI cannot reach.';
		}

		return null;
	}

	/**
	 * Validate an AssemblyAI status value against the known whitelist.
	 *
	 * @param string $status raw status from API response
	 *
	 * @return string validated status or 'error' as fallback
	 */
	private function sanitize_assemblyai_status( $status ) {
		return in_array( $status, self::VALID_STATUSES, true ) ? $status : 'error';
	}

	/**
	 * Get expected speaker count from Contributors module.
	 *
	 * @param mixed $episode
	 *
	 * @return int
	 */
	private function get_speakers_expected( $episode ) {
		if ( ! \Podlove\Modules\Base::is_active( 'contributors' ) ) {
			return 0;
		}

		$contributions = \Podlove\Modules\Contributors\Model\EpisodeContribution::find_all_by_episode_id( $episode->id );

		if ( empty( $contributions ) ) {
			return 0;
		}

		return count( $contributions );
	}
}
