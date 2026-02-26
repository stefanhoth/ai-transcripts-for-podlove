## Changelog

### [Unreleased](https://github.com/stefanhoth/ai-transcripts-for-podlove/compare/v1.0.10...HEAD) - 

- feat: Add Settings link to plugin listing on Plugins page
- Add Claude Code GitHub Workflow

- ci: add workflow_dispatch release workflow
- feat: add version bump script and improved release workflow
- ci: skip code review for Claude bot PRs
- feat: Add Settings link to plugin listing on Plugins page (#7)

#### New Features

- feat: add contributor speaker hint tip to episode and batch views @Stefan Hoth 

#### Fixes

- fix: call bump-version.sh via bash to avoid executable bit dependency @claude[bot] 

#### Chores And Housekeeping

- chore: track AI editor skills and configs in git @Stefan Hoth 
- chore: output release zip to dist/ folder @Stefan Hoth 

#### General Changes

- i18n: add translations for contributor tip and updated API key strings @Stefan Hoth 
- "Claude PR Assistant workflow" @Stefan Hoth 
- "Claude Code Review workflow" @Stefan Hoth 
- ci: use Node.js 22 (Active LTS) in release workflow @Stefan Hoth 

### [v1.0.10](https://github.com/stefanhoth/ai-transcripts-for-podlove/compare/v1.0.9...v1.0.10) -  25 February 2026 

#### New Features

- feat: add AssemblyAI product and API key doc links to settings page @Stefan Hoth 

#### Chores And Housekeeping

- chore: bump version to 1.0.10 @Stefan Hoth 

### [v1.0.9](https://github.com/stefanhoth/ai-transcripts-for-podlove/compare/v1.0.8...v1.0.9) -  25 February 2026 

#### Fixes

- fix: avoid manual input prompts in release script @Stefan Hoth 
- fix: correct speaker attribution for words at utterance boundaries @Stefan Hoth 

#### Chores And Housekeeping

- chore: bump version to 1.0.9 @Stefan Hoth 

### [v1.0.8](https://github.com/stefanhoth/ai-transcripts-for-podlove/compare/v1.0.7...v1.0.8) -  25 February 2026 

#### Fixes

- fix: sync plugin header version with AI_TRANSCRIPTS_VERSION constant @Stefan Hoth 
- fix: metabox container ID mismatch from rename @Stefan Hoth 

#### Chores And Housekeeping

- chore: bump version to 1.0.8 @Stefan Hoth 

### v1.0.7

#### New Features

- feat: add settings page with batch transcription @Stefan Hoth 
- feat: add REST API endpoints for transcription workflow @Stefan Hoth 
- feat: add episode meta box for one-click transcription @Stefan Hoth 
- feat: improve UX for transcription workflow and batch processing @Stefan Hoth 
- feat: move API key into collapsible section, show batch transcription first @Stefan Hoth 
- feat: add VTT converter for AssemblyAI transcripts @Stefan Hoth 
- feat: always display API key and validate against AssemblyAI @Stefan Hoth 
- feat: add main plugin file with dependency checks @Stefan Hoth 
- feat: show URL validation status in batch overview @Stefan Hoth 
- feat: rename menu entry from "AssemblyAI" to "AI Transcription" @Stefan Hoth 

#### Fixes

- fix: improve dependency checks for Contributors module @Stefan Hoth 
- fix: reject non-public audio URLs before sending to AssemblyAI @Stefan Hoth 
- fix: sanitize AssemblyAI API responses and use read-only episode lookups @Stefan Hoth 
- fix: add .env* to .gitignore to prevent leaking API keys @Stefan Hoth 

#### Chores And Housekeeping

- chore: add composer config with PSR-4 autoloading @Stefan Hoth 
- chore: add release script for GitHub releases @Stefan Hoth 
- chore: update package names and container names @Stefan Hoth 
- chore: configure test environment for German locale (de_DE) @Stefan Hoth 
- chore: add .gitignore @Stefan Hoth 
- chore: update Playwright to v1.58.2 @Stefan Hoth 
- chore: add .DS_Store and mp3/ to gitignore @Stefan Hoth 

#### Documentation Changes

- docs: add README with feature overview and disclaimer @Stefan Hoth 

#### Refactoring and Updates

- refactor: rename PHP namespace, constants, and option keys @Stefan Hoth 
- refactor: rename plugin from podlove-assemblyai to ai-transcripts-for-podlove @Stefan Hoth 
- refactor: rename JS globals and CSS class prefixes @Stefan Hoth 

#### Changes to Test Assests

- test: add Playwright E2E tests for meta box and settings page @Stefan Hoth 
- test: add VTT converter unit tests @Stefan Hoth 
- test: update selectors and route patterns for new plugin name @Stefan Hoth 

#### General Changes

- i18n: add German (de_DE) translations @Stefan Hoth 
- ci: add Docker Compose test environment with WP-CLI @Stefan Hoth 
- ci: use custom Dockerfile with WP-CLI and install Podlove from WordPress.org @Stefan Hoth 
