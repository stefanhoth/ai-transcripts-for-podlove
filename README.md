# AssemblyAI Transcripts for Podlove Publisher

A WordPress plugin that generates transcripts for [Podlove Publisher](https://podlove.org/podlove-podcast-publisher/) episodes using the [AssemblyAI](https://www.assemblyai.com/) speech-to-text API.

Transcripts are created with speaker diarization and imported directly into the Podlove Transcripts module.

## Features

- One-click transcription from the episode editor
- Batch transcription for multiple episodes
- Speaker diarization (automatic speaker labels)
- Imports as native Podlove transcripts (VTT format)

> [!TIP]
> Assign contributors to an episode in Podlove and the plugin will automatically send the expected speaker count to AssemblyAI, improving speaker detection accuracy in the transcript.

## Requirements

- WordPress 6.0+
- PHP 8.4+
- [Podlove Podcast Publisher](https://wordpress.org/plugins/podlove-podcasting-plugin-for-wordpress/) with the **Transcripts** and **Contributors** modules enabled
- An [AssemblyAI API key](https://www.assemblyai.com/)

## Installation

1. Download the latest release and upload to `wp-content/plugins/`
2. Activate the plugin
3. Go to **Podlove > AI Transcription** and enter your AssemblyAI API key

## Disclaimer

This is a community project by [Stefan Hoth](https://stefanhoth.com). It is **not** affiliated with, endorsed by, or officially connected to the [Podlove](https://podlove.org/) project or [AssemblyAI, Inc](https://www.assemblyai.com/).

## License

MIT
