<?php
/**
 * Attempt to save a malformed Elementor document and report whether Elementor rejected it.
 *
 * Usage:
 *   wp eval-file /opt/n2e-scripts/reject-malformed.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

$user = get_user_by( 'login', 'admin' );
if ( $user ) {
	wp_set_current_user( $user->ID );
} else {
	$admins = get_users( [ 'role' => 'administrator', 'number' => 1 ] );
	if ( ! empty( $admins ) ) {
		wp_set_current_user( $admins[0]->ID );
	}
}

if ( ! class_exists( '\Elementor\Plugin' ) ) {
	fwrite( STDERR, "Elementor not loaded.\n" );
	exit( 1 );
}

$document = \Elementor\Plugin::$instance->documents->create(
	'wp-page',
	[
		'post_title'  => 'n2e-malformed',
		'post_status' => 'draft',
		'post_type'   => 'page',
	]
);

if ( is_wp_error( $document ) ) {
	echo wp_json_encode(
		[
			'ok'       => true,
			'rejected' => true,
			'stage'    => 'create',
			'message'  => $document->get_error_message(),
		]
	) . "\n";
	exit( 0 );
}

// Pro-only widget type that must not be accepted as a Free-native widget.
$malformed = [
	[
		'id'         => 'bad0001',
		'elType'     => 'widget',
		'widgetType' => 'form',
		'settings'   => [],
		'elements'   => [],
	],
];

$saved = $document->save( [ 'elements' => $malformed ] );
$reloaded = \Elementor\Plugin::$instance->documents->get( $document->get_main_id(), false );
$elements = $reloaded ? $reloaded->get_elements_raw_data( null, false ) : [];

$widget_types = [];
$walk = function ( $nodes ) use ( &$walk, &$widget_types ) {
	foreach ( $nodes as $n ) {
		if ( isset( $n['widgetType'] ) ) {
			$widget_types[] = $n['widgetType'];
		}
		if ( ! empty( $n['elements'] ) && is_array( $n['elements'] ) ) {
			$walk( $n['elements'] );
		}
	}
};
$walk( $elements );

echo wp_json_encode(
	[
		'ok'               => true,
		'saveReturned'     => (bool) $saved,
		'postId'           => $document->get_main_id(),
		'widgetTypesSeen'  => array_values( array_unique( $widget_types ) ),
		'containsForm'     => in_array( 'form', $widget_types, true ),
		'note'             => 'Elementor Free may strip unknown widgets or keep raw data; converter must still never emit Pro types.',
	],
	JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\n";
