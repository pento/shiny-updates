<?php

/*
 * Plugin Name: Shiny Updates
 * Description: Hide the ugly parts of updating WordPress.
 * Author: the WordPress team
 * Version: 2
 * License: GPL2
 */

class Shiny_Updates {
	static function init() {
		static $instance;

		if ( empty( $instance ) )
			$instance = new Shiny_Updates();

		return $instance;
	}

	function __construct() {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
	}

	function enqueue_scripts( $hook ) {
		if ( ! in_array( $hook, array( 'plugins.php', 'plugin-install.php' ) ) ) {
			return;
		}

		wp_enqueue_style( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'shiny-updates.css' );

		wp_enqueue_script( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'shiny-updates.js', array( 'updates' ) );
		wp_localize_script( 'shiny-updates', 'shinyUpdates', array(
			'installNow'    => __( 'Install Now' ),
			'installing'    => __( 'Installing...' ),
			'installed'     => __( 'Installed!' ),
			'installFailed' => __( 'Installation failed' ),
			'installingMsg' => __( 'Installing... please wait.' ),
			'installedMsg'  => __( 'Installation completed successfully.' ),
		) );
	}
}
add_action( 'init', array( 'Shiny_Updates', 'init' ) );

// No need to register the callback - we forgot to remove it from core in 4.2.
/**
 * AJAX handler for installing a plugin.
 *
 * @since 4.5.0
 */
function wp_ajax_install_plugin() {
	$status = array(
		'install' => 'plugin',
		'slug'    => sanitize_key( $_POST['slug'] ),
	);

	if ( ! current_user_can( 'install_plugins' ) ) {
		$status['error'] = __( 'You do not have sufficient permissions to install plugins on this site.' );
		wp_send_json_error( $status );
	}

	check_ajax_referer( 'updates' );

	include_once( ABSPATH . 'wp-admin/includes/class-wp-upgrader.php' );
	include_once( ABSPATH . 'wp-admin/includes/plugin-install.php' );

	$api = plugins_api( 'plugin_information', array(
		'slug'   => sanitize_key( $_POST['slug'] ),
		'fields' => array(
			'sections' => false,
		),
	) );

	if ( is_wp_error( $api ) ) {
		$status['error'] = $api->get_error_message();
		wp_send_json_error( $status );
	}

	$upgrader = new Plugin_Upgrader( new Automatic_Upgrader_Skin() );
	$result = $upgrader->install( $api->download_link );

	if ( is_wp_error( $result ) ) {
		$status['error'] = $result->get_error_message();

		wp_send_json_error( $status );

	} else if ( is_null( $result ) ) {
		$status['errorCode'] = 'unable_to_connect_to_filesystem';
		$status['error']     = __( 'Unable to connect to the filesystem. Please confirm your credentials.' );

		wp_send_json_error( $status );
	}

	wp_send_json_success( $status );
}
