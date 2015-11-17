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

		add_filter( 'wp_prepare_themes_for_js', array( $this, 'theme_data' ) );

		add_action( 'wp_ajax_install-theme', 'wp_ajax_install_theme' );
		add_action( 'wp_ajax_update-theme', 'wp_ajax_update_theme' );
	}

	function enqueue_scripts( $hook ) {
		if ( ! in_array( $hook, array( 'plugins.php', 'plugin-install.php', 'themes.php', 'theme-install.php' ) ) ) {
			return;
		}

		wp_enqueue_style( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'shiny-updates.css' );

		wp_enqueue_script( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'shiny-updates.js', array( 'updates' ), null, true );
		wp_localize_script( 'shiny-updates', 'shinyUpdates', array(
			'installNow'    => __( 'Install Now' ),
			'installing'    => __( 'Installing...' ),
			'installed'     => __( 'Installed!' ),
			'installFailed' => __( 'Installation failed' ),
			'installingMsg' => __( 'Installing... please wait.' ),
			'installedMsg'  => __( 'Installation completed successfully.' ),
		) );

		if ( in_array( $hook, array( 'themes.php', 'theme-install.php' ) ) ) {
			wp_enqueue_script( 'shiny-theme-updates', plugin_dir_url( __FILE__ ) . 'shiny-theme-updates.js', array( 'theme', 'updates' ), null, true );
		}

		if ( 'theme-install.php' == $hook ) {
			add_action( 'in_admin_header', array( $this, 'theme_install_templates' ) );
		}
	}

	/**
	 * Adds a class and a data attribute to the "update now"-link.
	 *
	 * @param array $themes
	 * @return array
	 */
	function theme_data( $themes ) {
		$update = get_site_transient('update_themes');
		foreach ( $themes as $stylesheet => $theme ) {
			if ( isset( $theme['hasUpdate'] ) && $theme['hasUpdate'] && current_user_can('update_themes') && ! empty( $update->response[ $stylesheet ] ) ) {
				$themes[ $stylesheet ]['update'] = sprintf( '<p><strong>' . __( 'There is a new version of %1$s available. <a href="%2$s" class="thickbox" title="%3$s">View version %4$s details</a> or <a id="update-theme" data-slug="%5$s" href="%6$s">update now</a>.' ) . '</strong></p>',
					$theme['name'], esc_url( add_query_arg(array('TB_iframe' => 'true', 'width' => 1024, 'height' => 800), $update->response[ $stylesheet ]['url']) ), esc_attr( $theme['name'] ), $update->response[ $stylesheet ]['new_version'], $stylesheet, wp_nonce_url( admin_url( 'update.php?action=upgrade-theme&amp;theme=' . urlencode( $stylesheet ) ), 'upgrade-theme_' . $stylesheet ) );
			}
		}
		return $themes;
	}

	function theme_install_templates() {
		?>
		<script id="tmpl-theme" type="text/template">
			<# if ( data.screenshot_url ) { #>
				<div class="theme-screenshot">
					<img src="{{ data.screenshot_url }}" alt="" />
				</div>
			<# } else { #>
				<div class="theme-screenshot blank"></div>
			<# } #>
			<span class="more-details"><?php _ex( 'Details &amp; Preview', 'theme' ); ?></span>
			<div class="theme-author"><?php printf( __( 'By %s' ), '{{ data.author }}' ); ?></div>
			<h3 class="theme-name">{{ data.name }}</h3>

			<div class="theme-actions">
				<a class="button button-primary theme-install" data-slug="{{ data.id }}" href="{{ data.install_url }}"><?php esc_html_e( 'Install' ); ?></a>
				<a class="button button-secondary preview install-theme-preview" href="#"><?php esc_html_e( 'Preview' ); ?></a>
			</div>

			<# if ( data.installed ) { #>
				<div class="theme-installed"><?php _ex( 'Already Installed', 'theme' ); ?></div>
			<# } #>
		</script>

		<script id="tmpl-shiny-theme-preview" type="text/template">
			<div class="wp-full-overlay-sidebar">
				<div class="wp-full-overlay-header">
					<a href="#" class="close-full-overlay"><span class="screen-reader-text"><?php _e( 'Close' ); ?></span></a>
					<a href="#" class="previous-theme"><span class="screen-reader-text"><?php _ex( 'Previous', 'Button label for a theme' ); ?></span></a>
					<a href="#" class="next-theme"><span class="screen-reader-text"><?php _ex( 'Next', 'Button label for a theme' ); ?></span></a>
					<# if ( data.installed ) { #>
						<a href="#" class="button button-primary theme-install disabled"><?php _ex( 'Installed', 'theme' ); ?></a>
					<# } else { #>
						<a href="{{ data.install_url }}" class="button button-primary theme-install" data-slug="{{ data.id }}"><?php _e( 'Install' ); ?></a>
					<# } #>
				</div>
				<div class="wp-full-overlay-sidebar-content">
					<div class="install-theme-info">
						<h3 class="theme-name">{{ data.name }}</h3>
						<span class="theme-by"><?php printf( __( 'By %s' ), '{{ data.author }}' ); ?></span>

						<img class="theme-screenshot" src="{{ data.screenshot_url }}" alt="" />

						<div class="theme-details">
							<# if ( data.rating ) { #>
								<div class="theme-rating">
									{{{ data.stars }}}
									<span class="num-ratings">({{ data.num_ratings }})</span>
								</div>
							<# } else { #>
								<span class="no-rating"><?php _e( 'This theme has not been rated yet.' ); ?></span>
							<# } #>
								<div class="theme-version"><?php printf( __( 'Version: %s' ), '{{ data.version }}' ); ?></div>
								<div class="theme-description">{{{ data.description }}}</div>
						</div>
					</div>
				</div>
				<div class="wp-full-overlay-footer">
					<button type="button" class="collapse-sidebar button-secondary" aria-expanded="true" aria-label="<?php esc_attr_e( 'Collapse Sidebar' ); ?>">
						<span class="collapse-sidebar-arrow"></span>
						<span class="collapse-sidebar-label"><?php _e( 'Collapse' ); ?></span>
					</button>
				</div>
			</div>
			<div class="wp-full-overlay-main">
				<iframe src="{{ data.preview_url }}" title="<?php esc_attr_e( 'Preview' ); ?>" />
			</div>
		</script>
<?php
	}
}
add_action( 'init', array( 'Shiny_Updates', 'init' ) );

/**
 * AJAX handler for installing a theme.
 *
 * @since 4.5.0
 */
function wp_ajax_install_theme() {
	$status = array(
		'install' => 'theme',
		'slug'    => sanitize_key( $_POST['slug'] ),
	);

	if ( ! current_user_can( 'install_themes' ) ) {
		$status['error'] = __( 'You do not have sufficient permissions to install themes on this site.' );
		wp_send_json_error( $status );
	}

	check_ajax_referer( 'updates' );

	include_once( ABSPATH . 'wp-admin/includes/class-wp-upgrader.php' );
	include_once( ABSPATH . 'wp-admin/includes/theme.php' );

	$api = themes_api( 'theme_information', array(
		'slug'   => $status['slug'],
		'fields' => array( 'sections' => false )
	) );

	if ( is_wp_error( $api ) ) {
		$status['error'] = $api->get_error_message();
		wp_send_json_error( $status );
	}

	$upgrader = new Theme_Upgrader( new Automatic_Upgrader_Skin() );
	$result   = $upgrader->install( $api->download_link );

	if ( is_wp_error( $result ) ) {
		$status['error'] = $result->get_error_message();
		wp_send_json_error( $status );
	}

	// Never switch to theme (unlike plugin activation).
	// See WP_Theme_Install_List_Table::_get_theme_status() if we wanted to check on post-install status.

	wp_send_json_success( $status );
}

/**
 * AJAX handler for updating a theme.
 *
 * @since 4.5.0
 */
function wp_ajax_update_theme() {
	$status = array(
		'update' => 'theme',
		'slug'   => sanitize_key( $_POST['slug'] ),
	);

	if ( ! current_user_can( 'update_themes' ) ) {
		$status['error'] = __( 'You do not have sufficient permissions to update themes on this site.' );
		wp_send_json_error( $status );
	}

	check_ajax_referer( 'updates' );

	include_once( ABSPATH . 'wp-admin/includes/class-wp-upgrader.php' );

	$current = get_site_transient( 'update_themes' );
	if ( empty( $current ) ) {
		wp_update_themes();
	}

	$upgrader = new Theme_Upgrader( new Automatic_Upgrader_Skin() );
	$result   = $upgrader->bulk_upgrade( array( $status['slug'] ) );

	if ( is_array( $result ) ) {
		$result = $result[ $status['slug'] ];
	}

	if ( is_wp_error( $result ) ) {
		$status['error'] = $result->get_error_message();
		wp_send_json_error( $status );
	}

	wp_send_json_success( $status );
}

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
