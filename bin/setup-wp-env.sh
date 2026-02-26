#!/usr/bin/env bash
# Post-start configuration for the wp-env WordPress environment.
# Installs German locale and enables the Podlove Transcripts module.
# Runs automatically via lifecycleScripts.afterStart in .wp-env.json.
set -euo pipefail

WP="npx wp-env run cli wp"

echo "Setting up German locale..."
$WP language core install de_DE --activate || true

echo "Enabling Podlove Transcripts module..."
$WP eval "\$m = get_option('podlove_active_modules', []); \$m['transcripts'] = 'on'; update_option('podlove_active_modules', \$m);"

echo ""
echo "Environment ready!"
echo "  WordPress: http://localhost:8888"
echo "  Admin:     http://localhost:8888/wp-admin/"
echo "  Login:     admin / password"
echo ""
