<?php

/*
 * Plugin Name: Shiny Updates
 * Description: Hide the ugly parts of updating WordPress.
 * Author: pento
 * Version: 0.1
 * License: GPL2
 */

// Don't allow the plugin to be loaded directly
if ( ! function_exists( 'add_action' ) ) {
	echo "Please enable this plugin from your wp-admin.";
	exit;
}

/*
 * @package WordPress
 * @subpackage Upgrade/Install
 * @since 4.1.0
 */
class ShinyUpdates {
	static function init() {
		static $instance;

		if ( empty( $instance ) )
			$instance = new ShinyUpdates();

		return $instance;
	}

	function __construct() {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );

		add_action( 'wp_ajax_shiny_plugin_update', array( $this, 'update_plugin' ) );
	}

	function enqueue_scripts( $hook ) {
		if ( 'plugins.php' !== $hook ) {
			return;
		}

		wp_enqueue_style( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'shiny-updates.css' );

		wp_enqueue_script( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'shiny-updates.js', array( 'jquery', 'updates' ) );

		$data = array(
			'ajax_nonce'   => wp_create_nonce( 'shiny-updates' ),
			'updatingText' => __( 'Updating...' ),
			'updatedText'  => __( 'Updated!' )
		);
		wp_localize_script( 'shiny-updates', 'shinyUpdates', $data );
	}

	function update_plugin() {
		check_ajax_referer( 'shiny-updates' );

		include_once( ABSPATH . 'wp-admin/includes/class-wp-upgrader.php' );
		include_once( ABSPATH . 'wp-admin/includes/plugin-install.php' ); //for plugins_api..

		$plugin = urldecode( $_POST['plugin'] );

		$status = array(
			'update'    => 'plugin',
			'plugin'    => $plugin,
			'slug'      => $_POST['slug']
		);

		$upgrader = new Plugin_Upgrader( new Automatic_Upgrader_Skin() );
		$result = $upgrader->upgrade( $plugin );

		if ( is_wp_error( $result ) ) {
			$status['error'] = $result->get_error_message();
	 		wp_send_json_error( $status );
		}

		wp_send_json_success( $status );
	}
}

add_action( 'init', array( 'ShinyUpdates', 'init' ) );
