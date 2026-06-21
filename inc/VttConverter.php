<?php
/**
 * VTT format converter for the AI Transcripts for Podlove plugin.
 *
 * @package AiTranscriptsForPodlove
 */

namespace AiTranscriptsForPodlove;

/**
 * Converts AssemblyAI transcript JSON to WebVTT format.
 */
class VttConverter {

	public const MAX_SEGMENT_DURATION  = 5000; // 5 seconds in ms.
	public const MAX_CHARS_PER_LINE    = 42;
	public const MAX_LINES_PER_SEGMENT = 2;

	/**
	 * Convert AssemblyAI transcript response to WebVTT string.
	 *
	 * @param array $response decoded AssemblyAI transcript JSON
	 *
	 * @return string WebVTT content
	 */
	public static function convert( $response ) {
		$words      = isset( $response['words'] ) ? $response['words'] : array();
		$utterances = isset( $response['utterances'] ) ? $response['utterances'] : array();

		if ( ! empty( $words ) ) {
			return self::generateVttFromWords( $words, $utterances );
		}

		return "WEBVTT\n\n";
	}

	/**
	 * Builds a WebVTT string from word-level transcript data.
	 *
	 * @param array $words      Word objects from AssemblyAI response.
	 * @param array $utterances Utterance objects used for speaker assignment.
	 * @return string WebVTT content.
	 */
	private static function generateVttFromWords( array $words, array $utterances ) {
		$segments = self::createSubtitleSegments( $words, $utterances );

		if ( empty( $segments ) ) {
			return "WEBVTT\n\n";
		}

		$vtt = "WEBVTT\n\n";

		foreach ( $segments as $index => $segment ) {
			$start_time = self::formatTimestamp( $segment['start'] );
			$end_time   = self::formatTimestamp( $segment['end'] );
			$cue_number = $index + 1;

			$vtt .= "{$cue_number}\n";
			$vtt .= "{$start_time} --> {$end_time}\n";

			if ( ! empty( $segment['speaker'] ) ) {
				$speaker = 'Speaker ' . $segment['speaker'];
				$vtt    .= "<v {$speaker}>{$segment['text']}\n\n";
			} else {
				$vtt .= "{$segment['text']}\n\n";
			}
		}

		return $vtt;
	}

	/**
	 * Groups words into timed subtitle segments with optional speaker labels.
	 *
	 * @param array $words      Word objects from AssemblyAI response.
	 * @param array $utterances Utterance objects used for speaker assignment.
	 * @return array Segment arrays with start, end, text and speaker keys.
	 */
	private static function createSubtitleSegments( $words, $utterances ) {
		if ( empty( $words ) ) {
			return array();
		}

		// Build speaker map: word index -> speaker label.
		// Both arrays are sorted by time, so we use a pointer walk (O(n+m)).
		$word_count  = count( $words );
		$speaker_map = array();
		if ( ! empty( $utterances ) ) {
			$utterance_index = 0;
			$utterance_count = count( $utterances );

			for ( $i = 0; $i < $word_count; ++$i ) {
				$word = $words[ $i ];

				// Advance utterance pointer past utterances that end before this word.
				while ( $utterance_index < $utterance_count && $utterances[ $utterance_index ]['end'] <= $word['start'] ) {
					++$utterance_index;
				}

				if ( $utterance_index < $utterance_count
					&& $word['start'] >= $utterances[ $utterance_index ]['start']
					&& $word['end'] <= $utterances[ $utterance_index ]['end'] ) {
					$speaker_map[ $i ] = $utterances[ $utterance_index ]['speaker'];
				}
			}
		}

		$segments        = array();
		$current_segment = null;

		for ( $i = 0; $i < $word_count; ++$i ) {
			$word    = $words[ $i ];
			$speaker = isset( $speaker_map[ $i ] ) ? $speaker_map[ $i ] : null;

			// Start new segment if needed.
			if ( null === $current_segment ) {
				$current_segment = array(
					'start'   => $word['start'],
					'end'     => $word['end'],
					'text'    => $word['text'],
					'speaker' => $speaker,
				);

				continue;
			}

			// Check if we should start a new segment.
			$duration        = $word['end'] - $current_segment['start'];
			$text_length     = strlen( $current_segment['text'] ) + 1 + strlen( $word['text'] );
			$speaker_changed = $speaker && $current_segment['speaker'] && $speaker !== $current_segment['speaker'];

			$should_break = $duration > self::MAX_SEGMENT_DURATION
				|| $text_length > self::MAX_CHARS_PER_LINE * self::MAX_LINES_PER_SEGMENT
				|| $speaker_changed;

			if ( $should_break ) {
				$segments[] = $current_segment;

				$current_segment = array(
					'start'   => $word['start'],
					'end'     => $word['end'],
					'text'    => $word['text'],
					'speaker' => $speaker ?: $current_segment['speaker'],
				);
			} else {
				$current_segment['end']   = $word['end'];
				$current_segment['text'] .= ' ' . $word['text'];
				if ( $speaker ) {
					$current_segment['speaker'] = $speaker;
				}
			}
		}

		// Add final segment.
		if ( null !== $current_segment ) {
			$segments[] = $current_segment;
		}

		return $segments;
	}

	/**
	 * Format milliseconds to VTT timestamp (HH:MM:SS.mmm).
	 *
	 * @param int $ms milliseconds
	 *
	 * @return string formatted timestamp
	 */
	private static function formatTimestamp( $ms ) {
		$total_seconds = intdiv( (int) $ms, 1000 );
		$hours         = intdiv( $total_seconds, 3600 );
		$minutes       = intdiv( $total_seconds % 3600, 60 );
		$seconds       = $total_seconds % 60;
		$milliseconds  = (int) $ms % 1000;

		return sprintf( '%02d:%02d:%02d.%03d', $hours, $minutes, $seconds, $milliseconds );
	}
}
