<?php
/**
 * Sets up plugin-related functions.
 *
 * @package Shiny_Updates
 * @since 4.X.0
 */

/**
 * Enqueue scripts.
 *
 * @todo Merge: Add to wp_default_scripts()
 *
 * @param string $hook Current admin page.
 */
function su_enqueue_scripts( $hook ) {
	if ( ! in_array( $hook, array(
		'update-core.php',
	), true )
	) {
		return;
	}

	$plugins = $totals = new stdClass;

	if ( isset( $GLOBALS['totals'] ) ) {
		$totals = $GLOBALS['totals'];
	}

	if ( stristr( $hook, 'plugin' ) ) {
		if ( ! isset( $GLOBALS['plugins'] ) ) {
			$GLOBALS['plugins'] = array( 'all' => get_plugins() );
		}

		foreach ( $GLOBALS['plugins'] as $key => $list ) {
			$plugins->$key = array_keys( (array) $list );
		}
	}

	wp_enqueue_style( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'css/shiny-updates.css' );

	// Override updates JS.
	wp_enqueue_script( 'shiny-updates', plugin_dir_url( __FILE__ ) . 'js/shiny-updates.js', array( 'updates' ), false, true );
	wp_localize_script( 'shiny-updates', '_wpUpdatesSettings', array(
		'ajax_nonce' => wp_create_nonce( 'updates' ),
		'plugins'    => $plugins,
		'totals'     => $totals,
		'l10n'       => array(
			/* translators: %s: Search string */
			'searchResults'              => __( 'Search results for &#8220;%s&#8221;' ),
			'noPlugins'                  => __( 'You do not appear to have any plugins available at this time.' ),
			'noItemsSelected'            => __( 'Please select at least one item to perform this action on.' ),
			'updating'                   => __( 'Updating...' ), // No ellipsis.
			'updated'                    => __( 'Updated!' ),
			'update'                     => __( 'Update' ),
			'updateNow'                  => __( 'Update Now' ),
			'updateFailedShort'          => __( 'Update Failed!' ),
			/* translators: Error string for a failed update */
			'updateFailed'               => __( 'Update Failed: %s' ),
			/* translators: Plugin name and version */
			'updatingLabel'              => __( 'Updating %s...' ), // No ellipsis.
			'updatingAllLabel'           => __( 'Updating site...' ), // No ellipsis.
			'updatingCoreLabel'          => __( 'Updating WordPress...' ), // No ellipsis.
			'updatingTranslationsLabel'  => __( 'Updating translations...' ), // No ellipsis.
			/* translators: Plugin name and version */
			'updatedLabel'               => __( '%s updated!' ),
			/* translators: Plugin name and version */
			'updateFailedLabel'          => __( '%s update failed' ),
			/* translators: JavaScript accessible string */
			'updatingMsg'                => __( 'Updating... please wait.' ), // No ellipsis.
			/* translators: JavaScript accessible string */
			'updatedMsg'                 => __( 'Update completed successfully.' ),
			/* translators: JavaScript accessible string */
			'updateCancel'               => __( 'Update canceled.' ),
			'beforeunload'               => __( 'Updates may not complete if you navigate away from this page.' ),
			'installNow'                 => __( 'Install Now' ),
			'installing'                 => __( 'Installing...' ),
			'installed'                  => __( 'Installed!' ),
			'installFailedShort'         => __( 'Install Failed!' ),
			/* translators: Error string for a failed installation */
			'installFailed'              => __( 'Installation failed: %s' ),
			/* translators: Plugin/Theme name and version */
			'installingLabel'            => __( 'Installing %s...' ), // no ellipsis
			/* translators: Plugin/Theme name and version */
			'installedLabel'             => __( '%s installed!' ),
			/* translators: Plugin/Theme name and version */
			'installFailedLabel'         => __( '%s installation failed' ),
			'installingMsg'              => __( 'Installing... please wait.' ),
			'installedMsg'               => __( 'Installation completed successfully.' ),
			/* translators: Activation URL */
			'importerInstalledMsg'       => __( 'Importer installed successfully. <a href="%s">Activate plugin &#38; run importer</a>' ),
			/* translators: %s: Theme name */
			'aysDelete'                  => __( 'Are you sure you want to delete %s?' ),
			/* translators: %s: Plugin name */
			'aysDeleteUninstall'         => __( 'Are you sure you want to delete %s and its data?' ),
			'aysBulkDelete'              => __( 'Are you sure you want to delete the selected plugins and their data?' ),
			'deleting'                   => __( 'Deleting...' ),
			/* translators: %s: Error string for a failed deletion */
			'deleteFailed'               => __( 'Deletion failed: %s' ),
			'deleted'                    => __( 'Deleted!' ),
			'activate'                   => is_network_admin() ? __( 'Network Activate' ) : __( 'Activate' ),
			'activateImporter'           => __( 'Activate importer' ),
		),
	) );
}

/**
 * Displays the shiny update table.
 *
 * Includes core, plugin and theme updates.
 *
 * @todo Merge: Add directly to wp-admin/update-core.php
 *
 * @global string $wp_version             The current WordPress version.
 * @global string $required_php_version   The required PHP version string.
 * @global string $required_mysql_version The required MySQL version string.
 */
function su_update_table() {
	global $wp_version, $required_php_version, $required_mysql_version;
	?>
	<div class="wordpress-updates-table">
		<?php
		require_once( 'class-shiny-updates-list-table.php' );

		// Do the (un)dismiss actions before headers, so that they can redirect.
		if ( isset( $_GET['dismiss'] ) || isset( $_GET['undismiss'] ) ) {
			$version = isset( $_GET['version'] ) ? sanitize_text_field( wp_unslash( $_GET['version'] ) ) : false;
			$locale  = isset( $_GET['locale'] ) ? sanitize_text_field( wp_unslash( $_GET['locale'] ) ) : 'en_US';

			$update = find_core_update( $version, $locale );

			if ( $update ) {
				if ( isset( $_GET['dismiss'] ) ) {
					dismiss_core_update( $update );
				} else {
					undismiss_core_update( $version, $locale );
				}
			}
		}

		// Todo: Use _get_list_table().
		$updates_table = new Shiny_Updates_List_Table();
		$updates_table->prepare_items();

		if ( $updates_table->has_available_updates() ) :
			$updates_table->display();
		else : ?>
		<div class="notice notice-success inline">
			<p>
				<strong><?php _e( 'Everything is up to date.' ); ?></strong>
				<?php
				if ( wp_http_supports( array( 'ssl' ) ) ) {
					require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

					$upgrader = new WP_Automatic_Updater();

					$future_minor_update = (object) array(
						'current'       => $wp_version . '.1.next.minor',
						'version'       => $wp_version . '.1.next.minor',
						'php_version'   => $required_php_version,
						'mysql_version' => $required_mysql_version,
					);

					if ( $upgrader->should_update( 'core', $future_minor_update, ABSPATH ) ) {
						echo ' ' . __( 'Future security updates will be applied automatically.' );
					}
				}
				?>
			</p>
		</div>
		<?php endif; ?>
	</div>

	<?php
	$core_updates = (array) get_core_updates( array( 'dismissed' => true ) );

	if ( empty( $core_updates ) ) {
		return;
	}

	$first_pass = true;
	foreach ( $core_updates as $update ) :
		if ( 'en_US' === $update->locale &&
		     'en_US' === get_locale() ||
		     (
			     $update->packages->partial &&
			     $wp_version === $update->partial_version &&
			     1 === count( $core_updates )
		     )
		) {
			$version_string = $update->current;
		} else {
			$version_string = sprintf( '%s&ndash;<code>%s</code>', $update->current, $update->locale );
		}

		if ( ! isset( $update->response ) || 'latest' === $update->response ) :
			if ( $first_pass ) : ?>
				<div class="wordpress-reinstall-card card">
					<h2><?php _e( 'Need to re-install WordPress?' ); ?></h2>
			<?php endif; ?>

					<div class="wordpress-reinstall-card-item" data-type="core" data-reinstall="true" data-version="<?php echo esc_attr( $update->current ); ?>" data-locale="<?php echo esc_attr( $update->locale ); ?>">
						<p>
							<?php
								/* translators: %s: WordPress version */
								printf( __( 'If you need to re-install version %s, you can do so here.' ), $version_string );
							?>
						</p>

						<form method="post" action="update-core.php?action=do-core-reinstall" name="upgrade" class="upgrade">
							<?php wp_nonce_field( 'upgrade-core' ); ?>
							<input name="version" value="<?php echo esc_attr( $update->current ); ?>" type="hidden"/>
							<input name="locale" value="<?php echo esc_attr( $update->locale ); ?>" type="hidden"/>
							<p>
								<button type="submit" name="upgrade" class="button update-link"><?php esc_attr_e( 'Re-install Now' ); ?></button>
							</p>
						</form>
					</div>

			<?php if ( $first_pass ) : ?>
				</div>
			<?php
			$first_pass = false;
			endif;
		endif;
	endforeach;
}

/**
 * Filters the list of removable query args to add query args needed for Shiny Updates.
 *
 * @todo Merge: Add directly to wp_removable_query_args()
 *
 * @param array $query_args An array of query variables to remove from a URL.
 * @return array The filtered query args.
 */
function su_wp_removable_query_args( $query_args ) {
	$query_args[] = 'locale';
	$query_args[] = 'version';
	$query_args[] = 'dismiss';
	$query_args[] = 'undismiss';

	return $query_args;
}
