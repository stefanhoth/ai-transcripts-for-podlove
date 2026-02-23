#!/usr/bin/env bash
set -euo pipefail

# Shortcut for running wp-cli commands in the container
WP="docker compose exec -T wordpress wp --allow-root"

echo "Starting containers..."
docker compose up -d

echo "Waiting for WordPress to be ready..."
until curl -sf http://localhost:8080/wp-login.php > /dev/null 2>&1; do
    sleep 2
done

# Install WordPress if not already set up
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

# Activate Podlove Publisher
echo "Activating Podlove Publisher..."
$WP plugin activate podlove-podcasting-plugin-for-wordpress || true

# Enable Transcripts module in Podlove
echo "Enabling Transcripts module..."
$WP eval "
\$modules = get_option('podlove_active_modules', []);
\$modules['transcripts'] = 'on';
update_option('podlove_active_modules', \$modules);
"

# Activate our plugin
echo "Activating Podlove AssemblyAI..."
$WP plugin activate podlove-assemblyai || true

# Create a sample podcast episode for testing
echo "Creating sample episode..."
$WP eval "
if (!get_page_by_title('Test Episode', OBJECT, 'podcast')) {
    wp_insert_post([
        'post_type'   => 'podcast',
        'post_title'  => 'Test Episode',
        'post_status' => 'publish',
    ]);
    echo 'Sample episode created.';
} else {
    echo 'Sample episode already exists.';
}
"

echo ""
echo "Test environment ready!"
echo "  WordPress: http://localhost:8080"
echo "  Admin:     http://localhost:8080/wp-admin/"
echo "  Login:     admin / admin"
echo ""
echo "Run wp-cli commands with:"
echo "  docker compose exec wordpress wp --allow-root <command>"
echo ""
