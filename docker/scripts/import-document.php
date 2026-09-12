<?php
/**
 * Import a converter classic Elementor document (version 0.4) into a WP page
 * via Elementor's document save API — does not bypass Elementor document handling.
 *
 * Usage (inside wpcli container):
 *   wp eval-file /opt/n2e-scripts/import-document.php /opt/n2e-generated/docs/01-hero.json
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

// Elementor document::save requires an editable user; sanitizer also
// assumes manage_options to skip a broken iterate_data path on containers.
$user = get_user_by( 'login', 'admin' );
if ( $user ) {
	wp_set_current_user( $user->ID );
} else {
	$admins = get_users( [ 'role' => 'administrator', 'number' => 1 ] );
	if ( empty( $admins ) ) {
		fwrite( STDERR, "No administrator user available for Elementor save.\n" );
		exit( 1 );
	}
	wp_set_current_user( $admins[0]->ID );
}

$path = $args[0] ?? null;
if ( ! $path || ! file_exists( $path ) ) {
	fwrite( STDERR, "Usage: wp eval-file import-document.php <document.json>\n" );
	exit( 1 );
}

$raw = file_get_contents( $path );
$doc = json_decode( $raw, true );
if ( ! is_array( $doc ) ) {
	fwrite( STDERR, "Invalid JSON document.\n" );
	exit( 1 );
}

if ( ( $doc['version'] ?? null ) !== '0.4' ) {
	fwrite( STDERR, "Refusing document: expected classic version \"0.4\".\n" );
	exit( 1 );
}

if ( ! class_exists( '\Elementor\Plugin' ) ) {
	fwrite( STDERR, "Elementor plugin is not loaded.\n" );
	exit( 1 );
}

$elementor_version = defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : 'unknown';
if ( '4.2.4' !== $elementor_version ) {
	fwrite( STDERR, "Elementor version must be 4.2.4, got {$elementor_version}\n" );
	exit( 1 );
}

if ( is_plugin_active( 'elementor-pro/elementor-pro.php' ) ) {
	fwrite( STDERR, "Elementor Pro must not be active.\n" );
	exit( 1 );
}

$title = isset( $doc['title'] ) ? (string) $doc['title'] : 'n2e-import';
$elements = $doc['content'] ?? null;
if ( ! is_array( $elements ) ) {
	fwrite( STDERR, "Document missing content array.\n" );
	exit( 1 );
}

// Honor Free Page Layout from document settings.template when present.
// Allowed Free 4.2.4 templates: default, elementor_canvas, elementor_header_footer, elementor_theme.
$allowed_templates = [
	'default',
	'elementor_canvas',
	'elementor_header_footer',
	'elementor_theme',
];
$template = 'elementor_canvas';
if (
	isset( $doc['settings'] ) &&
	is_array( $doc['settings'] ) &&
	isset( $doc['settings']['template'] ) &&
	is_string( $doc['settings']['template'] ) &&
	in_array( $doc['settings']['template'], $allowed_templates, true )
) {
	$template = $doc['settings']['template'];
}

// Create through Elementor documents manager so meta / edit mode are correct.
$document = \Elementor\Plugin::$instance->documents->create(
	'wp-page',
	[
		'post_title'  => $title,
		'post_status' => 'publish',
		'post_type'   => 'page',
	]
);

if ( is_wp_error( $document ) ) {
	fwrite( STDERR, 'documents->create failed: ' . $document->get_error_message() . "\n" );
	exit( 1 );
}

$saved = $document->save(
	[
		'elements' => $elements,
		'settings' => [
			'post_status' => 'publish',
			'template'    => $template,
		],
	]
);

if ( ! $saved ) {
	fwrite( STDERR, "document->save returned false.\n" );
	exit( 1 );
}

// Sync WP page template meta (Elementor Full Width / Canvas / Theme).
update_post_meta( $document->get_main_id(), '_wp_page_template', $template );

// Re-load and read back through Elementor API.
$reloaded = \Elementor\Plugin::$instance->documents->get( $document->get_main_id(), false );
if ( ! $reloaded ) {
	fwrite( STDERR, "Could not reload document after save.\n" );
	exit( 1 );
}

$raw_elements = $reloaded->get_elements_raw_data( null, true );
$edit_mode = get_post_meta( $document->get_main_id(), '_elementor_edit_mode', true );
$data_meta = get_post_meta( $document->get_main_id(), '_elementor_data', true );

$result = [
	'ok'               => true,
	'postId'           => $document->get_main_id(),
	'permalink'        => get_permalink( $document->get_main_id() ),
	'elementorVersion' => $elementor_version,
	'editMode'         => $edit_mode,
	'hasElementorData' => ! empty( $data_meta ),
	'elements'         => $raw_elements,
];

echo wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n";
