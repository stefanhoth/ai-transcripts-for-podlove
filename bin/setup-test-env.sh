#!/usr/bin/env bash
set -euo pipefail

WP="docker compose exec -T wordpress wp --allow-root"

echo "Starting containers..."
docker compose up -d

echo "Waiting for WordPress..."
until curl -sf http://localhost:8080/ > /dev/null 2>&1; do
    sleep 2
done

# Install WordPress core
if ! $WP core is-installed 2>/dev/null; then
    echo "Installing WordPress..."
    $WP core install \
        --url="http://localhost:8080" \
        --title="Podlove Test" \
        --admin_user=admin \
        --admin_password=admin \
        --admin_email=admin@example.com \
        --skip-email
fi

# Install and activate Podlove Publisher from WordPress.org
echo "Installing Podlove Publisher from WordPress.org..."
$WP plugin install podlove-podcasting-plugin-for-wordpress --activate

# Enable Transcripts module
echo "Enabling Transcripts module..."
$WP eval "
\$modules = get_option('podlove_active_modules', []);
\$modules['transcripts'] = 'on';
update_option('podlove_active_modules', \$modules);
"

# Activate our plugin
echo "Activating Podlove AssemblyAI..."
$WP plugin activate podlove-assemblyai

# List active plugins
echo ""
$WP plugin list --status=active --fields=name,version

echo ""
echo "Test environment ready!"
echo "  WordPress: http://localhost:8080"
echo "  Admin:     http://localhost:8080/wp-admin/"
echo "  Login:     admin / admin"
echo ""
