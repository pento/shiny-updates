/* global pagenow */
window.wp = window.wp || {};

(function( $, wp ) {
	var $document = $( document );

	/**
	 * The WP Updates object.
	 *
	 * @type {object}
	 */
	wp.updates = {};

	/**
	 * User nonce for ajax calls.
	 *
	 * @since 4.2.0
	 *
	 * @type {string}
	 */
	wp.updates.ajaxNonce = window._wpUpdatesSettings.ajax_nonce;

	/**
	 * Localized strings.
	 *
	 * @since 4.2.0
	 *
	 * @type {object}
	 */
	wp.updates.l10n = window._wpUpdatesSettings.l10n;

	/**
	 * Whether filesystem credentials need to be requested from the user.
	 *
	 * @since 4.2.0
	 *
	 * @type {bool}
	 */
	wp.updates.shouldRequestFilesystemCredentials = false;

	/**
	 * Filesystem credentials to be packaged along with the request.
	 *
	 * @since 4.2.0
	 * @since 4.X.0 Added `available` property to indicate whether credentials have been provided.
	 *
	 * @type {object} filesystemCredentials                    Holds filesystem credentials.
	 * @type {object} filesystemCredentials.ftp                Holds FTP credentials.
	 * @type {string} filesystemCredentials.ftp.host           FTP host. Default empty string.
	 * @type {string} filesystemCredentials.ftp.username       FTP user name. Default empty string.
	 * @type {string} filesystemCredentials.ftp.password       FTP password. Default empty string.
	 * @type {string} filesystemCredentials.ftp.connectionType Type of FTP connection. 'ssh', 'ftp', or 'ftps'.
	 *                                                         Default empty string.
	 * @type {object} filesystemCredentials.ssh                Holds SSH credentials.
	 * @type {string} filesystemCredentials.ssh.publicKey      The public key. Default empty string.
	 * @type {string} filesystemCredentials.ssh.privateKey     The private key. Default empty string.
	 * @type {bool}   filesystemCredentials.available          Whether filesystem credentials have been provided.
	 *                                                         Default 'false'.
	 */
	wp.updates.filesystemCredentials = {
		ftp: {
			host: '',
			username: '',
			password: '',
			connectionType: ''
		},
		ssh: {
			publicKey: '',
			privateKey: ''
		},
		available: false
	};

	/**
	 * Flag if we're waiting for an update to complete.
	 *
	 * @since 4.2.0
	 *
	 * @type {bool}
	 */
	wp.updates.updateLock = false;

	/**
	 * Admin notice template.
	 *
	 * @since 4.X.0
	 *
	 * @type {function} A function that lazily-compiles the template requested.
	 */
	wp.updates.adminNotice = wp.template( 'wp-updates-admin-notice' );

	/**
	 * If the user tries to update a plugin while an update is
	 * already happening, it can be placed in this queue to perform later.
	 *
	 * @since 4.2.0
	 *
	 * @type {array}
	 */
	wp.updates.updateQueue = [];

	/**
	 * Store a jQuery reference to return focus to when exiting the request credentials modal.
	 *
	 * @since 4.2.0
	 *
	 * @type {jQuery}
	 */
	wp.updates.$elToReturnFocusToFromCredentialsModal;

	/**
	 * Adds or updates an admin notice.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} data
	 * @param {string} data.id        Unique id that will be used as the notice's id attribute.
	 * @param {string} data.className Class names that will be used in the admin notice.
	 * @param {string} data.message   The message displayed in the notice.
	 */
	wp.updates.addAdminNotice = function( data ) {
		var $notices     = $( '.wrap' ),
			$adminNotice = wp.updates.adminNotice( data );

		if ( $notices.find( '#' + data.id ).length ) {
			$notices.find( '#' + data.id ).replaceWith( $adminNotice );
		} else {
			$notices.find( '> h1' ).after( $adminNotice );
		}

		$document.trigger( 'wp-updates-notice-added' );
	};

	/**
	 * Handles Ajax requests to WordPress.
	 *
	 * @since 4.X.0
	 *
	 * @param {string} action The type of Ajax request ('update-plugin', 'install-theme', etc).
	 * @param {object} data   Data that needs to be passed to the ajax callback.
	 * @return {Deferred} Deferred object to register callbacks.
	 */
	wp.updates.ajax = function( action, data ) {
		if ( wp.updates.updateLock ) {
			wp.updates.updateQueue.push( {
				type: action,
				data: data
			} );

			// Return a Deferred object so callbacks can always be registered.
			return $.Deferred();
		}

		wp.updates.updateLock = true;

		data = _.extend( data, {
			'_ajax_nonce':   wp.updates.ajaxNonce,
			username:        wp.updates.filesystemCredentials.ftp.username,
			password:        wp.updates.filesystemCredentials.ftp.password,
			hostname:        wp.updates.filesystemCredentials.ftp.hostname,
			connection_type: wp.updates.filesystemCredentials.ftp.connectionType,
			public_key:      wp.updates.filesystemCredentials.ssh.publicKey,
			private_key:     wp.updates.filesystemCredentials.ssh.privateKey
		} );

		return wp.ajax.post( action, data ).always( wp.updates.ajaxAlways );
	};

	/**
	 * Actions performed after every Ajax request.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.ajaxAlways = function( response ) {
		wp.updates.updateLock = false;
		wp.updates.queueChecker();

		if ( 'undefined' !== typeof response.debug ) {
			_.map( response.debug, function( message ) {
				window.console.log( $( '<p />' ).html( message ).text() );
			} );
		}
	};

	/**
	 * Decrement update counts throughout the various menus.
	 *
	 * @since 3.9.0
	 *
	 * @param {string} upgradeType
	 */
	wp.updates.decrementCount = function( upgradeType ) {
		var $menuItem, $itemCount,
			$adminBarUpdates = $( '#wp-admin-bar-updates' ),
			$dashboardNavMenuUpdateCount = $( 'a[href="update-core.php"] .update-plugins' ),
			count, itemCount;

		count = $adminBarUpdates.find( '.ab-label' ).text();
		count = parseInt( count, 10 ) - 1;
		if ( count < 0 || isNaN( count ) ) {
			return;
		}
		$adminBarUpdates.find( '.ab-item' ).removeAttr( 'title' );
		$adminBarUpdates.find( '.ab-label' ).text( count );

		$dashboardNavMenuUpdateCount.each( function( index, element ) {
			element.className = element.className.replace( /count-\d+/, 'count-' + count );
		} );
		$dashboardNavMenuUpdateCount.removeAttr( 'title' );
		$dashboardNavMenuUpdateCount.find( '.update-count' ).text( count );

		switch ( upgradeType ) {
			case 'plugin':
				$menuItem  = $( '#menu-plugins' );
				$itemCount = $menuItem.find( '.plugin-count' );
				break;

			case 'theme':
				$menuItem  = $( '#menu-appearance' );
				$itemCount = $menuItem.find( '.theme-count' );
				break;
		}

		itemCount = $itemCount.eq( 0 ).text();
		itemCount = parseInt( itemCount, 10 ) - 1;
		if ( itemCount < 0 || isNaN( itemCount ) ) {
			return;
		}

		if ( itemCount > 0 ) {
			$( '.subsubsub .upgrade .count' ).text( '(' + itemCount + ')' );

			$itemCount.text( itemCount );
			$menuItem.find( '.update-plugins' ).each( function( index, element ) {
				element.className = element.className.replace( /count-\d+/, 'count-' + itemCount );
			} );
		} else {
			$( '.subsubsub .upgrade' ).remove();
			$menuItem.find( '.update-plugins' ).remove();
		}
	};

	/**
	 * Send an Ajax request to the server to update a plugin.
	 *
	 * @since 4.2.0
	 *
	 * @param {string} plugin Plugin basename
	 * @param {string} slug   Plugin slug
	 */
	wp.updates.updatePlugin = function( plugin, slug ) {
		var $updateRow, $card, $message, message;

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
			$updateRow = $( 'tr[data-plugin="' + plugin + '"]' );
			$message   = $updateRow.find( '.update-message' ).addClass( 'updating-message' ).find( 'p' );
			message    = wp.updates.l10n.updatingLabel.replace( '%s', $updateRow.find( '.plugin-title strong' ).text() );

		} else if ( 'plugin-install' === pagenow ) {
			$card    = $( '.plugin-card-' + slug );
			$message = $card.find( '.update-now' ).addClass( 'updating-message' );
			message  = wp.updates.l10n.updatingLabel.replace( '%s', $message.data( 'name' ) );

			// Remove previous error messages, if any.
			$card.removeClass( 'plugin-card-update-failed' ).find( '.notice.notice-error' ).remove();
		}

		if ( ! wp.updates.updateLock ) {
			$message.attr( 'aria-label', message );

			if ( $message.html() !== wp.updates.l10n.updating ) {
				$message.data( 'originaltext', $message.html() );
			}
			$message.text( wp.updates.l10n.updating );

			$document.trigger( 'wp-plugin-updating' );
		}

		wp.updates.ajax( 'update-plugin', { plugin: plugin, slug: slug } )
			.done( wp.updates.updateSuccess )
			.fail( wp.updates.updateError );
	};

	/**
	 * On a successful plugin update, update the UI with the result.
	 *
	 * @since 4.2.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateSuccess = function( response ) {
		var $pluginRow, $updateMessage, newText;

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
			$pluginRow = $( 'tr[data-plugin="' + response.plugin + '"]' );
			$updateMessage = $pluginRow.find( '.update-message' ).removeClass( 'updating-message notice-warning' ).addClass( 'notice-success' ).find( 'p' );
			$pluginRow.addClass( 'updated' ).removeClass( 'update' );

			// Update the version number in the row.
			newText = $pluginRow.find( '.plugin-version-author-uri' ).html().replace( response.oldVersion, response.newVersion );
			$pluginRow.find( '.plugin-version-author-uri' ).html( newText );

		} else if ( 'plugin-install' === pagenow ) {
			$updateMessage = $( '.plugin-card-' + response.slug ).find( '.update-now' ).removeClass( 'updating-message' ).addClass( 'button-disabled updated-message' );
		}

		$updateMessage
			.attr( 'aria-label', wp.updates.l10n.updatedLabel.replace( '%s', response.pluginName ) )
			.text( wp.updates.l10n.updated );

		wp.updates.decrementCount( 'plugin' );

		$document.trigger( 'wp-plugin-update-success', response );
	};

	/**
	 * On a plugin update error, update the UI appropriately.
	 *
	 * @since 4.2.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateError = function( response ) {
		var $card, $message, errorMessage;

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode && wp.updates.shouldRequestFilesystemCredentials ) {
			wp.updates.credentialError( response, 'update-plugin' );
			return;
		}

		errorMessage = wp.updates.l10n.updateFailed.replace( '%s', response.error );

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
			$message = $( 'tr[data-plugin="' + response.plugin + '"]' ).find( '.update-message' );
			$message.removeClass( 'updating-message notice-info' ).addClass( 'notice-error' ).find( 'p' ).html( errorMessage );

		} else if ( 'plugin-install' === pagenow ) {
			$card = $( '.plugin-card-' + response.slug )
				.addClass( 'plugin-card-update-failed' )
				.append( wp.updates.adminNotice({ className: 'update-message notice-error notice-alt is-dismissible', message: errorMessage }) );

			$card.find( '.update-now' )
				.attr( 'aria-label', wp.updates.l10n.updateFailedLabel.replace( '%s', response.pluginName ) )
				.text( wp.updates.l10n.updateFailedShort ).removeClass( 'updating-message' );

			$card.on( 'click', '.notice.is-dismissible .notice-dismiss', function() {

				// Use same delay as the total duration of the notice fadeTo + slideUp animation.
				setTimeout( function() {
					$card
						.removeClass( 'plugin-card-update-failed' )
						.find( '.column-name a' ).focus();

					$card.find( '.update-now' )
						.attr( 'aria-label', false )
						.text( wp.updates.l10n.updateNow );
				}, 200 );
			} );
		}

		$document.trigger( 'wp-plugin-update-error', response );
	};

	/**
	 * Send an Ajax request to the server to install a plugin.
	 *
	 * @since 4.X.0
	 *
	 * @param {string} slug Plugin identifier in the WordPress.org Plugin repository.
	 */
	wp.updates.installPlugin = function( slug ) {
		var $card    = $( '.plugin-card-' + slug ),
			$message = $card.find( '.install-now' );

		$message.addClass( 'updating-message' );
		$message.text( wp.updates.l10n.installing );
		wp.a11y.speak( wp.updates.l10n.installingMsg, 'polite' );

		// Remove previous error messages, if any.
		$card.removeClass( 'plugin-card-install-failed' ).find( '.notice.notice-error' ).remove();

		wp.updates.ajax( 'install-plugin', { slug: slug } )
			.done( wp.updates.installPluginSuccess )
			.fail( wp.updates.installPluginError );
	};

	/**
	 * On plugin install success, update the UI with the result.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.installPluginSuccess = function( response ) {
		var $message = $( '.plugin-card-' + response.slug ).find( '.install-now' );

		$message.removeClass( 'updating-message' ).addClass( 'updated-message button-disabled' );
		$message.text( wp.updates.l10n.installed );
		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );

		$document.trigger( 'wp-plugin-install-success', response );
	};

	/**
	 * On plugin install failure, update the UI appropriately.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.installPluginError = function( response ) {
		var $card   = $( '.plugin-card-' + response.slug ),
			$button = $card.find( '.install-now' ),
			errorMessage;

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'install-plugin' );
			return;
		}

		errorMessage = wp.updates.l10n.installFailed.replace( '%s', response.error );

		$card
			.addClass( 'plugin-card-update-failed' )
			.append( '<div class="notice notice-error is-dismissible"><p>' + errorMessage + '</p></div>' );

		$card.on( 'click', '.notice.is-dismissible .notice-dismiss', function() {

			// Use same delay as the total duration of the notice fadeTo + slideUp animation.
			setTimeout( function() {
				$card
					.removeClass( 'plugin-card-update-failed' )
					.find( '.column-name a' ).focus();
			}, 200 );
		} );

		$button
			.attr( 'aria-label', wp.updates.l10n.installFailedLabel.replace( '%s', response.pluginName ) )
			.text( wp.updates.l10n.installFailedShort ).removeClass( 'updating-message' );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-plugin-install-error', response );
	};

	/**
	 * Send an Ajax request to the server to delete a plugin.
	 *
	 * @since 4.X.0
	 *
	 * @param {string} plugin Plugin basename
	 * @param {string} slug   Plugin slug
	 */
	wp.updates.deletePlugin = function( plugin, slug ) {
		wp.a11y.speak( wp.updates.l10n.deleting, 'polite' );

		wp.updates.ajax( 'delete-plugin', { plugin: plugin, slug: slug } )
			.done( wp.updates.deletePluginSuccess )
			.fail( wp.updates.deletePluginError );
	};

	/**
	 * On plugin delete success, update the UI with the result.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.deletePluginSuccess = function( response ) {

		// Removes the plugin and updates rows.
		$( '[data-plugin="' + response.plugin + '"]' ).css( { backgroundColor:'#faafaa' } ).fadeOut( 350, function() {
			var $form       = $( '#bulk-action-form' ),
				$views      = $( '.subsubsub' ),
				columnCount = $form.find( 'thead th:not(.hidden), thead td' ).length,
				plugins     = window._wpUpdatesSettings.plugins;

			$( this ).remove();

			// Remove plugin from update count.
			if ( -1 !== plugins.upgrade.indexOf( response.plugin ) ) {
				plugins.upgrade = _.without( plugins.upgrade, response.plugin );
				wp.updates.decrementCount( 'plugin' );
			}

			// Remove from views.
			if ( -1 !== plugins.inactive.indexOf( response.plugin ) ) {
				plugins.inactive = _.without( plugins.inactive, response.plugin );
				if ( plugins.inactive.length > 0 ) {
					$views.find( '.inactive .count' ).text( '(' + plugins.inactive.length + ')' );
				} else {
					$views.find( '.inactive' ).remove();
				}
			}

			if ( -1 !== plugins.active.indexOf( response.plugin ) ) {
				plugins.active = _.without( plugins.active, response.plugin );
				if ( plugins.active.length ) {
					$views.find( '.active .count' ).text( '(' + plugins.active.length + ')' );
				} else {
					$views.find( '.active' ).remove();
				}
			}

			if ( -1 !== plugins.recently_activated.indexOf( response.plugin ) ) {
				plugins.recently_activated = _.without( plugins.recently_activated, response.plugin );
				if ( plugins.recently_activated.length ) {
					$views.find( '.recently_activated .count' ).text( '(' + plugins.recently_activated.length + ')' );
				} else {
					$views.find( '.recently_activated' ).remove();
				}
			}

			plugins.all = _.without( plugins.all, response.plugin );
			if ( plugins.all.length ) {
				$views.find( '.all .count' ).text( '(' + plugins.all.length + ')' );
			} else {
				$form.find( '.tablenav' ).css( { visibility: 'hidden' } );
				$views.find( '.all' ).remove();
				if ( ! $form.find( 'tr.no-items' ).length ) {
					$form.find( '#the-list' ).append( '<tr class="no-items"><td class="colspanchange" colspan="' + columnCount + '">' + wp.updates.l10n.noPlugins + '</td></tr>' );
				}
			}
		} );

		wp.a11y.speak( wp.updates.l10n.deleted, 'polite' );

		$document.trigger( 'wp-plugin-delete-success', response );
	};

	/**
	 * On plugin delete failure, update the UI appropriately.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.deletePluginError = function( response ) {
		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'delete-plugin' );
			return;
		}

		$( 'tr[data-plugin="' + response.plugin + '"]' ).find( '.column-description' ).prepend( wp.updates.adminNotice({ className: 'update-message notice-error notice-alt', message: response.error }) );

		$document.trigger( 'wp-plugin-delete-error', response );
	};

	/**
	 * Send an Ajax request to the server to update a theme.
	 *
	 * @since 4.X.0
	 *
	 * @param {string} slug Theme stylesheet.
	 */
	wp.updates.updateTheme = function( slug ) {
		var $message;

		if ( 'themes-network' === pagenow ) {
			$message = $( 'tr[data-slug="' + slug + '"]' ).find( '.update-message' ).addClass( 'updating-message' ).find( 'p' );
		} else {
			$message = $( '#update-theme' ).closest( '.notice' ).addClass( 'updating-message' );
		}

		if ( $message.html() !== wp.updates.l10n.updating ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message.text( wp.updates.l10n.updating );
		wp.a11y.speak( wp.updates.l10n.updatingMsg, 'polite' );

		wp.updates.ajax( 'update-theme', { 'slug': slug } )
			.done( wp.updates.updateThemeSuccess )
			.fail( wp.updates.updateThemeError );
	};

	/**
	 * On a successful theme update, update the UI with the result.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateThemeSuccess = function( response ) {
		var $message, newText, $themeRow = $( 'tr[data-slug="' + response.slug + '"]' );

		if ( 'themes-network' === pagenow ) {
			$message = $themeRow.find( '.update-message' ).removeClass( 'updating-message notice-warning' ).addClass( 'updated-message notice-success' ).find( 'p' );

			// Update the version number in the row.
			newText = $themeRow.find( '.theme-version-author-uri' ).html().replace( response.oldVersion, response.newVersion );
			$themeRow.find( '.theme-version-author-uri' ).html( newText );
		} else {
			$message = $( '.theme-info .notice' ).removeClass( 'updating-message notice-warning' ).addClass( 'updated-message notice-success' );
			$( '.theme-version' ).text( response.newVersion );
		}

		$message.text( wp.updates.l10n.updated );
		wp.a11y.speak( wp.updates.l10n.updatedMsg, 'polite' );

		wp.updates.decrementCount( 'theme' );

		$document.trigger( 'wp-plugin-update-success', response );
	};

	/**
	 * On a theme update error, update the UI appropriately.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateThemeError = function( response ) {
		var $message, errorMessage = wp.updates.l10n.updateFailed.replace( '%s', response.error );

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'update-theme' );
			return;
		}

		if ( 'themes-network' === pagenow ) {
			$message = $( 'tr[data-slug="' + response.slug + '"]' ).find( '.update-message ' ).removeClass( 'updating-message notice-warning' ).addClass( 'notice-error' ).find( 'p' );
		} else {
			$message = $( '.theme-info .notice' ).removeClass( 'updating-message notice-warning' ).addClass( 'notice-error is-dismissible' );
		}

		$message.text( errorMessage );
		wp.a11y.speak( errorMessage, 'polite' );

		$document.trigger( 'wp-theme-update-error', response );
	};

	/**
	 * Send an Ajax request to the server to install a theme.
	 *
	 * @since 4.X.0
	 *
	 * @param {string} slug Theme stylesheet.
	 */
	wp.updates.installTheme = function( slug ) {
		var $message = $( '.theme-install[data-slug="' + slug + '"]' );

		$message.addClass( 'updating-message' );
		if ( $message.html() !== wp.updates.l10n.installing ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message.text( wp.updates.l10n.installing );
		wp.a11y.speak( wp.updates.l10n.installingMsg, 'polite' );

		// Remove previous error messages, if any.
		$( '.install-theme-info, #' + slug ).removeClass( 'theme-install-failed' ).find( '.notice.notice-error' ).remove();

		wp.updates.ajax( 'install-theme', { 'slug': slug } )
			.done( wp.updates.installThemeSuccess )
			.fail( wp.updates.installThemeError );
	};

	/**
	 * On theme install success, update the UI with the result.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.installThemeSuccess = function( response ) {
		var $card    = $( '.wp-full-overlay-header, #' + response.slug ),
			$message = $card.find( '.theme-install' );

		$card.addClass( 'is-installed' ); // Hides the button, should show banner.
		$message.removeClass( 'updating-message' ).addClass( 'updated-message disabled' );
		$message.text( wp.updates.l10n.installed );
		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );

		$document.trigger( 'wp-install-theme-success', response );
	};

	/**
	 * On theme install failure, update the UI appropriately.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.installThemeError = function( response ) {
		var $card, $button,
			errorMessage = wp.updates.l10n.installFailed.replace( '%s', response.error ),
			$message     = wp.updates.adminNotice( { className: 'update-message notice-error notice-alt', message: errorMessage } );

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'install-theme' );
			return;
		}

		if ( $document.find( 'body' ).hasClass( 'full-overlay-active' ) ) {
			$button = $( '.theme-install[data-slug="' + response.slug + '"]' );
			$card   = $( '.install-theme-info' ).prepend( $message );
		} else {
			$card   = $( '#' + response.slug ).addClass( 'theme-install-failed' ).append( $message );
			$button = $card.find( '.theme-install' );
		}

		$button
			.attr( 'aria-label', wp.updates.l10n.installFailedLabel.replace( '%s', $card.find( '.theme-name' ).text() ) )
			.text( wp.updates.l10n.installFailedShort ).removeClass( 'updating-message' );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-theme-install-error', response );
	};

	/**
	 * Send an Ajax request to the server to install a theme.
	 *
	 * @since 4.X.0
	 *
	 * @param {string} slug Theme stylesheet.
	 */
	wp.updates.deleteTheme = function( slug ) {
		var $button = $( '.theme-actions .delete-theme' );

		if ( $button.html() !== wp.updates.l10n.deleting ) {
			$button.data( 'originaltext', $button.html() );
		}

		$button.text( wp.updates.l10n.deleting );
		wp.a11y.speak( wp.updates.l10n.deleting, 'polite' );

		// Remove previous error messages, if any.
		$( '.theme-info .update-message' ).remove();

		wp.updates.ajax( 'delete-theme', { slug: slug } )
			.done( wp.updates.deleteThemeSuccess )
			.fail( wp.updates.deleteThemeError );
	};

	/**
	 * On theme delete success, update the UI appropriately.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.deleteThemeSuccess = function( response ) {
		wp.a11y.speak( wp.updates.l10n.deleted, 'polite' );

		$document.trigger( 'wp-delete-theme-success', response );

		if ( 'themes-network' === pagenow ) {

			// Removes the theme and updates rows.
			$( '#' + response.slug + '-update, #' + response.slug ).css( { backgroundColor:'#faafaa' } ).fadeOut( 350, function() {
				$( this ).remove();
			} );
		}
	};

	/**
	 * On theme delete failure, update the UI appropriately.
	 *
	 * @since 4.X.0
	 *
	 * @param {object} response
	 */
	wp.updates.deleteThemeError = function( response ) {
		var errorMessage = wp.updates.l10n.deleteFailed.replace( '%s', response.error ),
			$message     = wp.updates.adminNotice({ className: 'update-message notice-error notice-alt', message: errorMessage } ),
			$button      = $( '.theme-actions .delete-theme' );

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'delete-theme' );
			return;
		}

		if ( 'themes-network' === pagenow ) {
			$( 'tr[data-slug="' + response.slug + '"]' ).find( '.column-description' ).prepend( $message );
		} else {
			$( '.theme-info .theme-description' ).before( $message );
		}
		$button.html( $button.data( 'originaltext' ) );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-theme-delete-error', response );
	};

	/**
	 * If an install/update job has been placed in the queue, queueChecker pulls it out and runs it.
	 *
	 * @since 4.2.0
	 * @since 4.X.0 Can handle multiple job types.
	 */
	wp.updates.queueChecker = function() {
		var job;

		if ( wp.updates.updateLock || wp.updates.updateQueue.length <= 0 ) {
			return;
		}

		job = wp.updates.updateQueue.shift();

		// Handle a queue job.
		switch ( job.type ) {
			case 'install-plugin':
				wp.updates.installPlugin( job.data.slug );
				break;

			case 'update-plugin':
				wp.updates.updatePlugin( job.data.plugin, job.data.slug );
				break;

			case 'delete-plugin':
				wp.updates.deletePlugin( job.data.plugin, job.data.slug );
				break;

			case 'install-theme':
				wp.updates.installTheme( job.data.slug );
				break;

			case 'update-theme':
				wp.updates.updateTheme( job.data.slug );
				break;

			case 'delete-theme':
				wp.updates.deleteTheme( job.data.slug );
				break;

			default:
				window.console.log( 'Failed to execute queued update job.', job );
				break;
		}
	};

	/**
	 * Request the users filesystem credentials if we don't have them already.
	 *
	 * @since 4.2.0
	 *
	 * @param {Event} event Event interface.
	 */
	wp.updates.requestFilesystemCredentials = function( event ) {
		if ( false === wp.updates.filesystemCredentials.available ) {

			/*
			 * After exiting the credentials request modal,
			 * return the focus to the element triggering the request.
			 */
			if ( event && ! wp.updates.$elToReturnFocusToFromCredentialsModal ) {
				wp.updates.$elToReturnFocusToFromCredentialsModal = $( event.target );
			}

			wp.updates.updateLock = true;
			wp.updates.requestForCredentialsModalOpen();
		}
	};

	/**
	 * Keydown handler for the request for credentials modal.
	 *
	 * Close the modal when the escape key is pressed.
	 * Constrain keyboard navigation to inside the modal.
	 *
	 * @since 4.2.0
	 *
	 * @param {Event} event Event interface.
	 */
	wp.updates.keydown = function( event ) {
		if ( 27 === event.keyCode ) {
			wp.updates.requestForCredentialsModalCancel();

		} else if ( 9 === event.keyCode ) {

			// #upgrade button must always be the last focus-able element in the dialog.
			if ( 'upgrade' === event.target.id && ! event.shiftKey ) {
				$( '#hostname' ).focus();
				event.preventDefault();

			} else if ( 'hostname' === event.target.id && event.shiftKey ) {
				$( '#upgrade' ).focus();
				event.preventDefault();
			}
		}
	};

	/**
	 * Open the request for credentials modal.
	 *
	 * @since 4.2.0
	 */
	wp.updates.requestForCredentialsModalOpen = function() {
		var $modal = $( '#request-filesystem-credentials-dialog' );
		$( 'body' ).addClass( 'modal-open' );
		$modal.show();

		$modal.find( 'input:enabled:first' ).focus();
		$modal.on( 'keydown', wp.updates.keydown );
	};

	/**
	 * Close the request for credentials modal.
	 *
	 * @since 4.2.0
	 */
	wp.updates.requestForCredentialsModalClose = function() {
		$( '#request-filesystem-credentials-dialog' ).hide();
		$( 'body' ).removeClass( 'modal-open' );
		wp.updates.$elToReturnFocusToFromCredentialsModal.focus();
	};

	/**
	 * The steps that need to happen when the modal is canceled out
	 *
	 * @since 4.2.0
	 * @since 4.X.0 Triggers an event for callbacks to listen to and add their actions.
	 */
	wp.updates.requestForCredentialsModalCancel = function() {

		// No updateLock and no updateQueue means we already have cleared things up.
		if ( false === wp.updates.updateLock && 0 === wp.updates.updateQueue.length ) {
			return;
		}

		// Remove the lock, and clear the queue.
		wp.updates.updateLock  = false;
		wp.updates.updateQueue = [];

		wp.updates.requestForCredentialsModalClose();

		$document.trigger( 'credential-modal-cancel' );
	};

	/**
	 * Show an error message in the request for credentials form.
	 *
	 * @since 4.2.0
	 *
	 * @param {string} message Error message.
	 */
	wp.updates.showErrorInCredentialsForm = function( message ) {
		var $modal = $( '#request-filesystem-credentials-form' );

		// Remove any existing error.
		$modal.find( '.notice' ).remove();
		$modal.find( 'h1' ).after( '<div class="notice notice-alt notice-error"><p>' + message + '</p></div>' );
	};

	/**
	 * Events that need to happen when there is a credential error.
	 *
	 * @since 4.2.0
	 *
	 * @param {object} response Ajax response.
	 * @param {string} type     The type of action.
	 */
	wp.updates.credentialError = function( response, type ) {
		wp.updates.updateQueue.push( {
			type: type,
			data: {
				/*
				 * Not cool that we're depending on response for this data.
				 * This would feel more whole in a view all tied together.
				 */
				plugin: response.plugin,
				slug: response.slug
			}
		} );

		wp.updates.filesystemCredentials.available = false;
		wp.updates.showErrorInCredentialsForm( response.error );
		wp.updates.requestFilesystemCredentials();
	};

	/**
	 * Potentially add an AYS to a user attempting to leave the page.
	 *
	 * If an update is on-going and a user attempts to leave the page,
	 * open an "Are you sure?" alert.
	 *
	 * @since 4.2.0
	 */
	wp.updates.beforeunload = function() {
		if ( wp.updates.updateLock ) {
			return wp.updates.l10n.beforeunload;
		}
	};

	$( function() {
		var $theList         = $( '#the-list' ),
			$bulkActionForm  = $( '#bulk-action-form' ),
			$filesystemModal = $( '#request-filesystem-credentials-dialog' );

		/*
		 * Check whether a user needs to submit filesystem credentials based on whether
		 * the form was output on the page server-side.
		 *
		 * @see {wp_print_request_filesystem_credentials_modal() in PHP}
		 */
		wp.updates.shouldRequestFilesystemCredentials = $filesystemModal.length > 0 ;

		/**
		 * File system credentials form submit noop-er / handler.
		 *
		 * @since 4.2.0
		 */
		$filesystemModal.on( 'submit', 'form', function() {

			// Persist the credentials input by the user for the duration of the page load.
			wp.updates.filesystemCredentials.ftp.hostname       = $( '#hostname' ).val();
			wp.updates.filesystemCredentials.ftp.username       = $( '#username' ).val();
			wp.updates.filesystemCredentials.ftp.password       = $( '#password' ).val();
			wp.updates.filesystemCredentials.ftp.connectionType = $( 'input[name="connection_type"]:checked' ).val();
			wp.updates.filesystemCredentials.ssh.publicKey      = $( '#public_key' ).val();
			wp.updates.filesystemCredentials.ssh.privateKey     = $( '#private_key' ).val();
			wp.updates.filesystemCredentials.available          = true;

			wp.updates.requestForCredentialsModalClose();

			// Unlock and invoke the queue.
			wp.updates.updateLock = false;
			wp.updates.queueChecker();

			return false;
		} );

		/**
		 * Close the request credentials modal when clicking the 'Cancel' button or outside of the modal.
		 *
		 * @since 4.2.0
		 */
		$filesystemModal.find( '[data-js-action="close"], .notification-dialog-background' ).on( 'click', wp.updates.requestForCredentialsModalCancel );

		/**
		 * Hide SSH fields when not selected.
		 *
		 * @since 4.2.0
		 */
		$filesystemModal.on( 'change', 'input[name="connection_type"]', function() {
			$( this ).parents( 'form' ).find( '#private_key, #public_key' ).parents( 'label' ).toggle( ( 'ssh' === $( this ).val() ) );
		}).change();

		/**
		 * Click handler for plugin updates in List Table view.
		 *
		 * @since 4.2.0
		 *
		 * @param {Event} event Event interface.
		 */
		$theList.on( 'click', '[data-plugin] .update-link', function( event ) {
			var $pluginRow = $( event.target ).parents( 'tr' );
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			// Return the user to the input box of the plugin's table row after closing the modal.
			wp.updates.$elToReturnFocusToFromCredentialsModal = $pluginRow.find( '.check-column input' );
			wp.updates.updatePlugin( $pluginRow.data( 'plugin' ), $pluginRow.data( 'slug' ) );
		} );

		/**
		 * Click handler for plugin updates in plugin install view.
		 *
		 * @since 4.2.0
		 *
		 * @param {Event} event Event interface.
		 */
		$( '.plugin-card' ).on( 'click', '.update-now', function( event ) {
			var $button = $( event.target );
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			wp.updates.updatePlugin( $button.data( 'plugin' ), $button.data( 'slug' ) );
		} );

		/**
		 * Install a plugin.
		 *
		 * @since 4.X.0
		 *
		 * @param {Event} event Event interface.
		 */
		$theList.on( 'click', '.install-now', function( event ) {
			var $button = $( event.target );
			event.preventDefault();

			if ( $button.hasClass( 'button-disabled' ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );

				$document.on( 'credential-modal-cancel', function() {
					var $message = $( '.install-now.updating-message' );

					$message.removeClass( 'updating-message' );
					$message.text( wp.updates.l10n.installNow );
					wp.a11y.speak( wp.updates.l10n.updateCancel, 'polite' );
				} );
			}

			wp.updates.installPlugin( $button.data( 'slug' ) );
		} );

		/**
		 * Delete a plugin.
		 *
		 * @since 4.X.0
		 *
		 * @param {Event} event Event interface.
		 */
		$theList.on( 'click', '[data-plugin] a.delete', function( event ) {
			var $pluginRow = $( event.target ).parents( 'tr' );
			event.preventDefault();

			if ( ! window.confirm( wp.updates.l10n.aysDelete ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			wp.updates.deletePlugin( $pluginRow.data( 'plugin' ), $pluginRow.data( 'slug' ) );
		} );

		/**
		 * Update a theme.
		 *
		 * @since 4.X.0
		 *
		 * @param {Event} event Event interface.
		 */
		$document.on( 'click', '.themes-php.network-admin a[href*="upgrade-theme"]', function( event ) {
			var $link = $( event.target ).parents( 'tr' );
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			// Return the user to the input box of the theme's table row after closing the modal.
			wp.updates.$elToReturnFocusToFromCredentialsModal = $link.find( '.check-column input' );
			wp.updates.updateTheme( $link.data( 'slug' ) );
		} );

		/**
		 * Delete a theme.
		 *
		 * @since 4.X.0
		 *
		 * @param {Event} event Event interface.
		 */
		$document.on( 'click', '.themes-php.network-admin a.delete', function( event ) {
			var $link = $( event.target ).parents( 'tr' );
			event.preventDefault();

			if ( ! window.confirm( wp.updates.l10n.aysDelete ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			wp.updates.deleteTheme( $link.data( 'slug' ) );
		} );

		/**
		 * Bulk action handler for plugins.
		 *
		 * @since 4.X.0
		 *
		 * @param {Event} event Event interface.
		 */
		$bulkActionForm.on( 'click', '[type="submit"]', function( event ) {
			var action        = $( event.target ).siblings( 'select' ).val(),
				itemsSelected = $bulkActionForm.find( 'input[name="checked[]"]:checked' ),
				pluginAction, success = 0, error = 0, errorMessages = [];

			if ( 'plugins' !== pagenow && 'plugins-network' !== pagenow ) {
				return;
			}

			if ( ! itemsSelected.length ) {
				event.preventDefault();
				$( 'html, body' ).animate( { scrollTop: 0 } );

				return wp.updates.addAdminNotice({
					id: 'no-items-selected',
					className: 'notice-error is-dismissible',
					message: wp.updates.l10n.noItemsSelected
				} );
			}

			switch ( action ) {
				case 'update-selected':
					pluginAction = wp.updates.updatePlugin;
					break;

				case 'delete-selected':
					pluginAction = wp.updates.deletePlugin;
					break;

				default:
					return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			event.preventDefault();

			// Un-check the bulk checkboxes.
			$bulkActionForm.find( '.manage-column [type="checkbox"]' ).prop( 'checked', false );

			// Find all the checkboxes which have been checked.
			itemsSelected.each( function( index, element ) {
				var $checkbox  = $( element ),
					$pluginRow = $checkbox.parents( 'tr' );

				// Un-check the box.
				$checkbox.prop( 'checked', false );

				// Only add update-able plugins to the update queue.
				if ( 'update-selected' === action && ! $pluginRow.hasClass( 'update' ) ) {
					return;
				}

				pluginAction( $pluginRow.data( 'plugin' ), $pluginRow.data( 'slug' ) );
			} );

			$document.on( 'wp-plugin-update-success', function() {
				success++;
			} );

			$document.on( 'wp-plugin-update-error', function( event, response ) {
				error++;
				errorMessages.push( response.pluginName + ': ' + response.error );
			} );

			$document.on( 'wp-plugin-update-success wp-plugin-update-error', function() {
				wp.updates.adminNotice = wp.template( 'wp-bulk-updates-admin-notice' );

				wp.updates.addAdminNotice( {
					id: 'bulk-action-notice',
					successes: success,
					errors: error,
					errorMessages: errorMessages
				} );

				$( '#bulk-action-notice' ).on( 'click', 'button', function() {
					$( '#bulk-action-notice' ).find( 'ul' ).toggleClass( 'hidden' );
				} );
			} );
		} );

		/**
		 * Bulk action handler for themes.
		 *
		 * @since 4.X.0
		 *
		 * @param {Event} event Event interface.
		 */
		$bulkActionForm.on( 'click', '[type="submit"]', function( event ) {
			var action        = $( event.target ).siblings( 'select' ).val(),
				itemsSelected = $bulkActionForm.find( 'input[name="checked[]"]:checked' ),
				themeAction;

			if ( 'themes-network' !== pagenow ) {
				return;
			}

			if ( ! itemsSelected.length ) {
				event.preventDefault();
				$( 'html, body' ).animate( { scrollTop: 0 } );

				return wp.updates.addAdminNotice({
					id: 'no-items-selected',
					className: 'notice-error is-dismissible',
					message: wp.updates.l10n.noItemsSelected
				} );
			}

			switch ( action ) {
				case 'update-selected':
					themeAction = wp.updates.updateTheme;
					break;

				case 'delete-selected':
					themeAction = wp.updates.deleteTheme;
					break;

				default:
					return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			event.preventDefault();

			// Un-check the bulk checkboxes.
			$bulkActionForm.find( '.manage-column [type="checkbox"]' ).prop( 'checked', false );

			// Find all the checkboxes which have been checked.
			itemsSelected.each( function( index, element ) {
				var $checkbox = $( element ),
					$themeRow = $checkbox.parents( 'tr' );

				// Un-check the box.
				$checkbox.prop( 'checked', false );

				// Only add update-able themes to the update queue.
				if ( 'update-selected' === action && ! $themeRow.hasClass( 'update' ) ) {
					return;
				}

				themeAction( $themeRow.data( 'slug' ) );
			} );
		} );

		/**
		 * Handle events after the credential modal was closed.
		 *
		 * @since 4.X.0
		 */
		$document.on( 'credential-modal-cancel', function() {
			var plugin, $message;

			if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
				plugin   = wp.updates.updateQueue[0].data.plugin;
				$message = $( 'tr[data-plugin="' + plugin + '"]' ).find( '.update-message' );
			} else if ( 'plugin-install' === pagenow ) {
				$message = $( '.update-now.updating-message' );
			} else {
				$message = $( '.updating-message' );
			}

			$message.removeClass( 'updating-message' );
			$message.html( $message.data( 'originaltext' ) );
			wp.a11y.speak( wp.updates.l10n.updateCancel, 'polite' );
		} );

		/**
		 * Make notices dismissible.
		 *
		 * @since 4.X.0
 		 */
		$document.on( 'wp-updates-notice-added wp-theme-update-error wp-theme-install-error', function() {
			$( '.notice.is-dismissible' ).each( function() {
				var $notice = $( this ),
					$button = $( '<button type="button" class="notice-dismiss"><span class="screen-reader-text"></span></button>' ),
					btnText = window.commonL10n.dismiss || '';

				// Ensure plain text.
				$button.find( '.screen-reader-text' ).text( btnText );
				$button.on( 'click.wp-dismiss-notice', function( event ) {
					event.preventDefault();

					$notice.fadeTo( 100, 0, function() {
						$notice.slideUp( 100, function() {
							$notice.remove();
						} );
					} );
				} );

				$notice.append( $button );
			} );
		} );

		/**
		 * Handle changes to the plugin search box on the new-plugin page,
		 * searching the repository dynamically.
		 *
		 * @since 4.X.0
		 *
		 * @todo Add a spinner during search?
		 */
		$( 'input.wp-filter-search' ).on( 'keyup search', _.debounce( function() {
			var data = {
					_ajax_nonce: wp.updates.ajaxNonce,
					s:           $( this ).val(),
					tab:         'search',
					type:        $( '#typeselector' ).val()
				};

			if ( 'undefined' !== typeof wp.updates.searchRequest ) {
				wp.updates.searchRequest.abort();
			}

			wp.updates.searchRequest = wp.ajax.post( 'search-install-plugins', data ).done( function( response ) {
				$theList.empty().append( response.items );
				delete wp.updates.searchRequest;
			} );
		}, 250 ) );

		/**
		 * Handle changes to the plugin search box on the Installed Plugins screen,
		 * searching the plugin list dynamically.
		 *
		 * @since 4.X.0
		 *
		 * @todo Add a spinner during search?
		 */
		$( '#plugin-search-input' ).on( 'keyup search', _.debounce( function() {
			var data = {
					_ajax_nonce: wp.updates.ajaxNonce,
					s:           $( this ).val()
				};

			if ( 'undefined' !== typeof wp.updates.searchRequest ) {
				wp.updates.searchRequest.abort();
			}

			wp.updates.searchRequest = wp.ajax.post( 'search-plugins', data ).done( function( response ) {

				// Can we just ditch this whole subtitle business?
				var $subTitle    = $( '<span />' ).addClass( 'subtitle' ).text( wp.updates.l10n.searchResults.replace( '%s', data.s ) ),
					$oldSubTitle = $( '.wrap .subtitle' );

				if ( 0 === data.s.length ) {
					$oldSubTitle.remove();
				} else if ( $oldSubTitle.length ) {
					$oldSubTitle.replaceWith( $subTitle );
				} else {
					$( '.wrap h1' ).append( $subTitle );
				}

				$( '#bulk-action-form' ).empty().append( response.items );
				delete wp.updates.searchRequest;
			} );
		}, 250 ) );

		/**
		 * Trigger a search event when the search type gets changed.
		 *
		 * @since 4.X.0
		 */
		$( '#typeselector' ).on( 'change', function() {
			$( 'input.wp-filter-search' ).trigger( 'search' );
		} );
	} );

	/**
	 * Update plugin from the details modal on `plugin-install.php`.
	 *
	 * @since 4.2.0
	 *
	 * @param {Event} event Event interface.
	 */
	$( '#plugin_update_from_iframe' ).on( 'click', function( event ) {
		var target = window.parent === window ? null : window.parent,
			job;

		$.support.postMessage = !! window.postMessage;

		if ( false === $.support.postMessage || null === target || -1 !== window.parent.location.pathname.indexOf( 'update-core.php' ) ) {
			return;
		}

		event.preventDefault();

		job = {
			action: 'updatePlugin',
			type: 'update-plugin',
			data: {
				plugin: $( this ).data( 'plugin' ),
				slug: $( this ).data( 'slug' )
			}
		};

		target.postMessage( JSON.stringify( job ), window.location.origin );
	} );

	/**
	 * Handles postMessage events.
	 *
	 * @since 4.2.0
	 * @since 4.X.0 Switched `update-plugin` action to use the updateQueue.
	 *
	 * @param {Event} event Event interface.
	 */
	$( window ).on( 'message', function( event ) {
		var originalEvent  = event.originalEvent,
			expectedOrigin = document.location.protocol + '//' + document.location.hostname,
			message;

		if ( originalEvent.origin !== expectedOrigin ) {
			return;
		}

		message = $.parseJSON( originalEvent.data );

		if ( 'undefined' === typeof message.action ) {
			return;
		}

		switch ( message.action ) {
			/*
			 * Called from `wp-admin/includes/class-wp-upgrader-skins.php`.
			 * @todo Check if that can be removed once this plugin was merged.
			 */
			case 'decrementUpdateCount':
				wp.updates.decrementCount( message.upgradeType );
				break;

			case 'updatePlugin':
				/* jscs:disable requireCamelCaseOrUpperCaseIdentifiers */
				window.tb_remove();
				/* jscs:enable */

				wp.updates.updateQueue.push( message );
				wp.updates.queueChecker();
				break;
		}
	} );

	/**
	 * Adds a callback to display a warning before leaving the page.
	 *
	 * @since 4.2.0
	 */
	$( window ).on( 'beforeunload', wp.updates.beforeunload );

} )( jQuery, window.wp );
