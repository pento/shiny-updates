/* global pagenow */
window.wp = window.wp || {};

(function( $, wp ) {
	var $document = $( document );

	wp.updates = {};

	/**
	 * User nonce for ajax calls.
	 *
	 * @since 4.2.0
	 *
	 * @var string
	 */
	wp.updates.ajaxNonce = window._wpUpdatesSettings.ajax_nonce;

	/**
	 * Localized strings.
	 *
	 * @since 4.2.0
	 *
	 * @var object
	 */
	wp.updates.l10n = window._wpUpdatesSettings.l10n;

	/**
	 * Whether filesystem credentials need to be requested from the user.
	 *
	 * @since 4.2.0
	 *
	 * @var bool
	 */
	wp.updates.shouldRequestFilesystemCredentials = null;

	/**
	 * Filesystem credentials to be packaged along with the request.
	 *
	 * @since 4.2.0
	 *
	 * @var object
	 */
	wp.updates.filesystemCredentials = {
		ftp: {
			host: null,
			username: null,
			password: null,
			connectionType: null
		},
		ssh: {
			publicKey: null,
			privateKey: null
		}
	};

	/**
	 * Flag if we're waiting for an update to complete.
	 *
	 * @since 4.2.0
	 *
	 * @var bool
	 */
	wp.updates.updateLock = false;

	/**
	 * Flag if we've done an update successfully.
	 *
	 * @since 4.2.0
	 *
	 * @var bool
	 */
	wp.updates.updateDoneSuccessfully = false;

	/**
	 * If the user tries to update a plugin while an update is
	 * already happening, it can be placed in this queue to perform later.
	 *
	 * @since 4.2.0
	 *
	 * @var array
	 */
	wp.updates.updateQueue = [];

	/**
	 * Store a jQuery reference to return focus to when exiting the request credentials modal.
	 *
	 * @since 4.2.0
	 *
	 * @var jQuery object
	 */
	wp.updates.$elToReturnFocusToFromCredentialsModal = null;

	/**
	 * Handles Ajax requests to WordPress.
	 *
	 * @since 4.5.0
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
		});

		return wp.ajax.post( action, data ).always( wp.updates.ajaxAlways );
	};

	/**
	 * Actions performed after every Ajax request.
	 *
	 * @since 4.5.0
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
		var $pluginsMenuItem = $( '#menu-plugins' ),
			$adminBarUpdates = $( '#wp-admin-bar-updates' ),
			$dashboardNavMenuUpdateCount = $( 'a[href="update-core.php"] .update-plugins' ),
			count, pluginCount;

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
				pluginCount = $pluginsMenuItem.find( '.plugin-count' ).eq( 0 ).text();
				pluginCount = parseInt( pluginCount, 10 ) - 1;
				if ( pluginCount < 0 || isNaN( pluginCount ) ) {
					return;
				}

				if ( pluginCount > 0 ) {
					$( '.subsubsub .upgrade .count' ).text( '(' + pluginCount + ')' );

					$pluginsMenuItem.find( '.plugin-count' ).text( pluginCount );
					$pluginsMenuItem.find( '.update-plugins' ).each( function( index, elem ) {
						elem.className = elem.className.replace( /count-\d+/, 'count-' + pluginCount );
					} );
				} else {
					$( '.subsubsub .upgrade' ).remove();
					$pluginsMenuItem.find( '.update-plugins' ).remove();
				}
				break;

			case 'theme':
				break;
		}
	};

	/**
	 * Send an Ajax request to the server to update a plugin.
	 *
	 * @since 4.2.0
	 *
	 * @param {string} plugin
	 * @param {string} slug
	 */
	wp.updates.updatePlugin = function( plugin, slug ) {
		var $updateRow, $card, $message, message;

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
			$updateRow = $( 'tr[data-plugin="' + plugin + '"]' );
			$message   = $updateRow.find( '.update-message' );
			message    = wp.updates.l10n.updatingLabel.replace( '%s', $updateRow.find( '.plugin-title strong' ).text() );

		} else if ( 'plugin-install' === pagenow ) {
			$card    = $( '.plugin-card-' + slug );
			$message = $card.find( '.update-now' );
			message  = wp.updates.l10n.updatingLabel.replace( '%s', $message.data( 'name' ) );

			// Remove previous error messages, if any.
			$card.removeClass( 'plugin-card-update-failed' ).find( '.notice.notice-error' ).remove();
		}

		$message.addClass( 'updating-message' );

		if ( ! wp.updates.updateLock ) {
			$message.attr( 'aria-label', message );
			wp.updates.updateProgressMessage( message );

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
			$pluginRow = $( 'tr[data-plugin="' + response.plugin + '"]' ).first();
			$updateMessage = $pluginRow.next().find( '.update-message' );
			$pluginRow.addClass( 'updated' ).removeClass( 'update' );

			// Update the version number in the row.
			newText = $pluginRow.find( '.plugin-version-author-uri' ).html().replace( response.oldVersion, response.newVersion );
			$pluginRow.find( '.plugin-version-author-uri' ).html( newText );

			// Add updated class to update message plugin row.
			$pluginRow.next().addClass( 'updated' );

		} else if ( 'plugin-install' === pagenow ) {
			$updateMessage = $( '.plugin-card-' + response.slug ).find( '.update-now' ).addClass( 'button-disabled' );
		}

		$updateMessage.removeClass( 'updating-message' ).addClass( 'updated-message' )
			.attr( 'aria-label', wp.updates.l10n.updatedLabel.replace( '%s', response.pluginName ) )
			.text( wp.updates.l10n.updated );

		wp.updates.updateDoneSuccessfully = true;
		wp.updates.updateProgressMessage( wp.updates.l10n.updatedMsg );
		wp.updates.decrementCount( 'plugin' );

		$document.trigger( 'wp-plugin-update-success', response );
		wp.updates.pluginUpdateSuccesses++;
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

		wp.updates.updateDoneSuccessfully = false;

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode && wp.updates.shouldRequestFilesystemCredentials ) {
			wp.updates.credentialError( response, 'update-plugin' );
			return;
		}

		errorMessage = wp.updates.l10n.updateFailed.replace( '%s', response.error );

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
			$message = $( 'tr[data-plugin="' + response.plugin + '"]' ).find( '.update-message' );
			$message.html( errorMessage ).removeClass( 'updating-message' );

		} else if ( 'plugin-install' === pagenow ) {
			$card = $( '.plugin-card-' + response.slug )
				.addClass( 'plugin-card-update-failed' )
				.append( '<div class="notice notice-error is-dismissible"><p>' + errorMessage + '</p></div>' );

			$card.find( '.update-now' )
				.attr( 'aria-label', wp.updates.l10n.updateFailedLabel.replace( '%s', response.pluginName ) )
				.html( wp.updates.l10n.updateFailedShort ).removeClass( 'updating-message' );

			$card.on( 'click', '.notice.is-dismissible .notice-dismiss', function() {

				// Use same delay as the total duration of the notice fadeTo + slideUp animation.
				setTimeout( function() {
					$card
						.removeClass( 'plugin-card-update-failed' )
						.find( '.column-name a' ).focus();
				}, 200 );
			} );
		}

		wp.updates.updateProgressMessage( errorMessage, 'notice-error' );

		$document.trigger( 'wp-plugin-update-error', response );
		wp.updates.pluginUpdateFailures++;
	};

	/**
	 * Set up the progress indicator.
	 */
	wp.updates.setupProgressIndicator = function() {
		var $progressTemplate;

		/**
		 * Only set up the progress updater once.
		 */
		if ( ! _.isUndefined( wp.updates.progressUpdates ) ) {
			return;
		}

		// Set up the message lock for message queueing.
		wp.updates.messageLock  = false;
		wp.updates.messageQueue = [];

		/**
		 * Set up the notifcation template.
		 */
		$progressTemplate = $( '#tmpl-wp-progress-template' );
		if ( 0 !== $progressTemplate.length ) {
			wp.updates.progressTemplate = wp.template( 'wp-progress-template' );
			wp.updates.progressUpdates  = $( '#wp-progress-placeholder' );
		}

	};

	/**
	 * Update the progress indicator with a new message.
	 *
	 * @param {String}  message A string to display in the prigress indicator.
	 * @param {boolean} isError Whether the message indicates an error.
	 */
	wp.updates.updateProgressMessage = function( message, messageClass ) {

		// Check to ensure progress updater is set up.
		if ( ! _.isUndefined( wp.updates.progressUpdates ) ) {

			// Add the message to a queue so we can display messages in a throttled manner.
			wp.updates.messageQueue.push( { message: message, messageClass: messageClass } );
			wp.updates.processMessageQueue();
		}
	};

	/**
	 * Process the message queue, showing messages in a throttled manner.
	 */
	wp.updates.processMessageQueue = function() {
		var queuedMessage;

		// If we are already displaying a message, pause briefly and try again.
		if ( wp.updates.messageLock ) {
			setTimeout( wp.updates.processMessageQueue, 500 );
		} else {

			// Anything left in the queue?
			if ( 0 !== wp.updates.messageQueue.length ) {

				// Lock message displaying until our message displays briefly.
				wp.updates.messageLock = true;

				queuedMessage = wp.updates.messageQueue.shift();

				// Update the progress message.
				wp.updates.progressUpdates.append(
					wp.updates.progressTemplate(
						{
							message: queuedMessage.message,
							noticeClass: _.isUndefined( queuedMessage.messageClass ) ? 'notice-success' : 'notice-error'
						}
					)
				);
				wp.a11y.speak( wp.updates.l10n.updatingMsg, 'notice-error' === queuedMessage.messageClass ? 'assertive' : 'polite' );

				$( document ).trigger( 'wp-progress-updated' );

				// After a brief delay, unlock and call the queue again.
				setTimeout( function() {
					wp.updates.messageLock = false;
					wp.updates.processMessageQueue();
				}, 1000 );
			}
		}
	};

	/**
	 * Send an Ajax request to the server to update plugins in bulk.
	 *
	 * @since 4.5.0
	 */
	wp.updates.bulkUpdatePlugins = function( plugins ) {
		var $message;

		// Set up the progress indicaator.
		wp.updates.setupProgressIndicator();

		// Start the bulk plugin updates. Reset the count for totals, successes and failures.
		wp.updates.pluginsToUpdateCount  = plugins.length;
		wp.updates.pluginUpdateSuccesses = 0;
		wp.updates.pluginUpdateFailures  = 0;
		wp.updates.updateProgressMessage(
			wp.updates.getPluginUpdateProgress()
		);

		_.each( plugins, function( plugin ) {
			$message = $( 'tr[data-plugin="' + plugin.plugin + '"]' ).find( '.update-message' );

			$message.addClass( 'updating-message' );
			if ( $message.html() !== wp.updates.l10n.updating ) {
				$message.data( 'originaltext', $message.html() );
			}

			$message.text( wp.updates.l10n.updateQueued );

			wp.updates.updatePlugin( plugin.plugin, plugin.slug );
		} );
	};

	/**
	 * Build a string describing the bulk update progress.
	 */
	wp.updates.getPluginUpdateProgress = function() {
		var updateMessage = wp.updates.l10n.updatePluginsQueuedMsg.replace( '%d', wp.updates.pluginsToUpdateCount );

		if ( 0 !== wp.updates.pluginUpdateSuccesses ) {
		updateMessage += ' ' + wp.updates.l10n.updatedPluginsSuccessMsg.replace( '%d', wp.updates.pluginUpdateSuccesses );
		}
		if ( 0 !== wp.updates.pluginUpdateFailures ) {
		updateMessage += ' ' + wp.updates.l10n.updatedPluginsFailureMsg.replace( '%d', wp.updates.pluginUpdateFailures );
		}

		return updateMessage;

	};

	/**
	 * Send an Ajax request to the server to install a plugin.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
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
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.installPluginSuccess = function( response ) {
		var $message = $( '.plugin-card-' + response.slug ).find( '.install-now' );

		$message.removeClass( 'updating-message' ).addClass( 'updated-message button-disabled' );
		$message.text( wp.updates.l10n.installed );
		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );

		wp.updates.updateDoneSuccessfully = true;
		$document.trigger( 'wp-plugin-install-success', response );
	};

	/**
	 * On plugin install failure, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.installPluginError = function( response ) {
		var $card   = $( '.plugin-card-' + response.slug ),
			$button = $card.find( '.install-now' ),
			errorMessage;

		wp.updates.updateDoneSuccessfully = false;

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
	 * @since 4.5.0
	 *
	 * @param {string} plugin
	 * @param {string} slug
	 */
	wp.updates.deletePlugin = function( plugin, slug ) {
		wp.a11y.speak( wp.updates.l10n.deletinggMsg, 'polite' );

		wp.updates.ajax( 'delete-plugin', { plugin: plugin, slug: slug } )
			.done( wp.updates.deletePluginSuccess )
			.fail( wp.updates.deletePluginError );
	};

	/**
	 * On plugin delete success, update the UI with the result.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.deletePluginSuccess = function( response ) {
		var $pluginRows = $( '[data-plugin="' + response.plugin + '"]' );

		// Remove plugin from update count.
		if ( $pluginRows.length > 1 ) {
			wp.updates.decrementCount( 'plugin' );
		}

		// Removes the plugin and updates rows.
		$pluginRows.css( { backgroundColor:'#faafaa' } ).fadeOut( 350, function() {
			$( this ).remove();
		} );

		wp.a11y.speak( wp.updates.l10n.deletedMsg, 'polite' );
		wp.updates.updateDoneSuccessfully = true;

		$document.trigger( 'wp-plugin-delete-success', response );
	};

	/**
	 * On plugin delete failure, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.deletePluginError = function( response ) {
		wp.updates.updateDoneSuccessfully = false;

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'delete-plugin' );
			return;
		}

		$document.trigger( 'wp-plugin-delete-error', response );
	};

	/**
	 * Send an Ajax request to the server to update a theme.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
	 */
	wp.updates.updateTheme = function( slug ) {
		var $message;

		if ( 'themes-network' === pagenow ) {
			$message = $( '#' + slug + ' ~ .plugin-update-tr' ).find( '.update-message' );
		} else {
			$message = $( '#update-theme' ).closest( '.notice' );
		}

		$message.addClass( 'updating-message' );
		if ( $message.html() !== wp.updates.l10n.updating ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message.text( wp.updates.l10n.updating );
		wp.a11y.speak( wp.updates.l10n.updatingMsg, 'polite' );

		// Remove previous error messages, if any.
		$( '#' + slug ).removeClass( 'theme-update-failed' ).find( '.notice.notice-error' ).remove();

		wp.updates.ajax( 'update-theme', { 'slug': slug } )
			.done( wp.updates.updateThemeSuccess )
			.fail( wp.updates.updateThemeError );
	};

	/**
	 * On a successful theme update, update the UI with the result.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateThemeSuccess = function( response ) {
		var $message, newText, $themeRow = $( '#' + response.slug );

		if ( 'themes-network' === pagenow ) {
			$message = $( '#' + response.slug + ' ~ .plugin-update-tr' ).find( '.update-message' );

			// Update the version number in the row.
			newText = $themeRow.find( '.theme-version-author-uri' ).html().replace( response.oldVersion, response.newVersion );
			$themeRow.find( '.theme-version-author-uri' ).html( newText );
		} else {
			$message = $( '.theme-info .notice' );
			$( '.theme-version' ).text( response.newVersion );
		}

		$message.removeClass( 'updating-message notice-warning' ).addClass( 'updated-message notice-success' );
		$message.text( wp.updates.l10n.updated );
		$themeRow.find( '.theme-update' ).remove();

		wp.a11y.speak( wp.updates.l10n.updatedMsg, 'polite' );

		wp.updates.decrementCount( 'theme' );
		wp.updates.updateDoneSuccessfully = true;

		$document.trigger( 'wp-plugin-update-success', response );
	};

	/**
	 * On a theme update error, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateThemeError = function( response ) {
		var $message, errorMessage = wp.updates.l10n.updateFailed.replace( '%s', response.error );

		if ( 'themes-network' === pagenow ) {
			$message = $( '#' + response.slug + ' ~ .plugin-update-tr' ).find( '.update-message' );
		} else {
			$message = $( '.theme-info .notice' ).removeClass( 'notice-warning' ).addClass( 'notice-error is-dismissible' );
		}

		$message.text( errorMessage ).removeClass( 'updating-message' );
		wp.a11y.speak( errorMessage, 'polite' );

		$document.trigger( 'wp-theme-update-error', response );
	};

	/**
	 * Send an Ajax request to the server to install a theme.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
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
	 * @since 4.5.0
	 ** @param {object} response
	 */
	wp.updates.installThemeSuccess = function( response ) {
		var $card = $( '#' + response.slug ),
			$message = $card.find( '.theme-install' );

		$message.removeClass( 'updating-message' ).addClass( 'updated-message disabled' );
		$message.text( wp.updates.l10n.installed );
		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );
		$card.addClass( 'is-installed' ); // Hides the button, should show banner.

		$document.trigger( 'wp-install-theme-success', response );
	};

	/**
	 * On theme install failure, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.installThemeError = function( response ) {
		var $card, $button,
			errorMessage = wp.updates.l10n.installFailed.replace( '%s', response.error );

		if ( $document.find( 'body' ).hasClass( 'full-overlay-active' ) ) {
			$button = $( '.theme-install[data-slug="' + response.slug + '"]' );
			$card   = $( '.install-theme-info' );
		} else {
			$card   = $( '#' + response.slug );
			$button = $card.find( '.theme-install' );
		}

		$card
			.addClass( 'theme-install-failed' )
			.append( '<div class="notice notice-error"><p>' + errorMessage + '</p></div>' );

		$button
			.attr( 'aria-label', wp.updates.l10n.installFailedLabel.replace( '%s', $card.find( '.theme-name' ).text() ) )
			.text( wp.updates.l10n.installFailedShort ).removeClass( 'updating-message' );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-theme-install-error', response );
	};

	/**
	 * Send an Ajax request to the server to install a theme.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
	 */
	wp.updates.deleteTheme = function( slug ) {
		var $message = $( '.theme-install[data-slug="' + slug + '"]' );

		$message.addClass( 'updating-message' );
		if ( $message.html() !== wp.updates.l10n.installing ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message.text( wp.updates.l10n.installing );
		wp.a11y.speak( wp.updates.l10n.installingMsg, 'polite' );

		// Remove previous error messages, if any.
		$( '.install-theme-info, #' + slug ).removeClass( 'theme-install-failed' ).find( '.notice.notice-error' ).remove();

		wp.updates.ajax( 'delete-theme', { 'slug': slug } )
			.done( wp.updates.deleteThemeSuccess )
			.fail( wp.updates.deleteThemeError );
	};

	/**
	 * On theme delete success, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.deleteThemeSuccess = function( response ) {
		wp.a11y.speak( wp.updates.l10n.deletedMsg, 'polite' );

		$document.trigger( 'wp-delete-theme-success', response );

		if ( 'themes-network' === pagenow ) {

			// Removes the theme and updates rows.
			$( '#' + response.slug + '-update, #' + response.slug ).css( { backgroundColor:'#faafaa' } ).fadeOut( 350, function() {
				$( this ).remove();
			} );
		} else {

			// Back to themes overview.
			window.location = location.pathname;
		}
	};

	/**
	 * On theme delete failure, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.deleteThemeError = function( response ) {

		// @todo fix/test this section
		var $card, $button,
			errorMessage = wp.updates.l10n.deleteFailed.replace( '%s', response.error );

		if ( $document.find( 'body' ).hasClass( 'full-overlay-active' ) ) {
			$button = $( '.theme-install[data-slug="' + response.slug + '"]' );
			$card   = $( '.install-theme-info' );
		} else {
			$card   = $( '#' + response.slug );
			$button = $card.find( '.theme-install' );
		}

		$card
			.addClass( 'theme-install-failed' )
			.append( '<div class="notice notice-error"><p>' + errorMessage + '</p></div>' );

		$button
			.attr( 'aria-label', wp.updates.l10n.installFailedLabel.replace( '%s', $card.find( '.theme-name' ).text() ) )
			.text( wp.updates.l10n.installFailedShort ).removeClass( 'updating-message' );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-theme-delete-error', response );
	};

	/**
	 * Show an error message in the request for credentials form.
	 *
	 * @param {string} message
	 * @since 4.2.0
	 */
	wp.updates.showErrorInCredentialsForm = function( message ) {
		var $modal = $( '.notification-dialog' );

		// Remove any existing error.
		$modal.find( '.error' ).remove();

		$modal.find( 'h3' ).after( '<div class="error">' + message + '</div>' );
	};

	/**
	 * Events that need to happen when there is a credential error.
	 *
	 * @since 4.2.0
	 */
	wp.updates.credentialError = function( response, type ) {
		wp.updates.updateQueue.push( {
			'type': type,
			'data': {
				/*
				 * Not cool that we're depending on response for this data.
				 * This would feel more whole in a view all tied together.
				 */
				plugin: response.plugin,
				slug: response.slug
			}
		} );
		wp.updates.showErrorInCredentialsForm( response.error );
		wp.updates.requestFilesystemCredentials();
	};

	/**
	 * If an install/update job has been placed in the queue, queueChecker pulls it out and runs it.
	 *
	 * @since 4.2.0
	 * @since 4.5.0 Can handle multiple job types.
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
	 */
	wp.updates.requestFilesystemCredentials = function( event ) {
		if ( false === wp.updates.updateDoneSuccessfully ) {

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
	 */
	wp.updates.keydown = function( event ) {
		if ( 27 === event.keyCode ) {
			wp.updates.requestForCredentialsModalCancel();

		} else if ( 9 === event.keyCode ) {
			event.preventDefault();

			// #upgrade button must always be the last focus-able element in the dialog.
			if ( 'upgrade' === event.target.id && ! event.shiftKey ) {
				$( '#hostname' ).focus();

			} else if ( 'hostname' === event.target.id && event.shiftKey ) {
				$( '#upgrade' ).focus();
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
		$modal.keydown( wp.updates.keydown );
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
	 * @since 4.5.0 Triggers an event for callbacks to listen to and add their actions.
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

		// File system credentials form submit noop-er / handler.
		$filesystemModal.on( 'submit', 'form', function() {

			// Persist the credentials input by the user for the duration of the page load.
			wp.updates.filesystemCredentials.ftp.hostname       = $( '#hostname' ).val();
			wp.updates.filesystemCredentials.ftp.username       = $( '#username' ).val();
			wp.updates.filesystemCredentials.ftp.password       = $( '#password' ).val();
			wp.updates.filesystemCredentials.ftp.connectionType = $( 'input[name="connection_type"]:checked' ).val();
			wp.updates.filesystemCredentials.ssh.publicKey      = $( '#public_key' ).val();
			wp.updates.filesystemCredentials.ssh.privateKey     = $( '#private_key' ).val();

			wp.updates.requestForCredentialsModalClose();

			// Unlock and invoke the queue.
			wp.updates.updateLock = false;
			wp.updates.queueChecker();

			return false;
		});

		// Close the request credentials modal when.
		$( '#request-filesystem-credentials-dialog [data-js-action="close"], .notification-dialog-background' ).on( 'click', function() {
			wp.updates.requestForCredentialsModalCancel();
		});

		// Hide SSH fields when not selected.
		$filesystemModal.on( 'change', 'input[name="connection_type"]', function() {
			$( this ).parents( 'form' ).find( '#private_key, #public_key' ).parents( 'label' ).toggle( ( 'ssh' === $( this ).val() ) );
		}).change();

		// Click handler for plugin updates in List Table view.
		$( '.plugin-update-tr' ).on( 'click', '.update-link', function( event ) {
			var $updateRow = $( event.target ).parents( '.plugin-update-tr' );
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			// Return the user to the input box of the plugin's table row after closing the modal.
			wp.updates.$elToReturnFocusToFromCredentialsModal = $( '#' + $updateRow.data( 'slug' ) ).find( '.check-column input' );
			wp.updates.updatePlugin( $updateRow.data( 'plugin' ), $updateRow.data( 'slug' ) );
		} );

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
		 */
		$theList.on( 'click', 'a.delete', function( event ) {
			var $link = $( event.target );
			event.preventDefault();

			if ( ! window.confirm( wp.updates.l10n.aysDelete ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			wp.updates.deletePlugin( $link.data( 'plugin' ), $link.data( 'slug' ) );
		} );

		/**
		 * Update a theme.
		 */
		$document.on( 'click', '.themes-php.network-admin a[href*="upgrade-theme"]', function( event ) {
			var $link = $( event.target ).parents( 'tr' ).prev();
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			// Return the user to the input box of the plugin's table row after closing the modal.
			wp.updates.$elToReturnFocusToFromCredentialsModal = $( '#' + $link.attr( 'id' ) ).find( '.check-column input' );
			wp.updates.updateTheme( $link.attr( 'id' ) );
		} );

		/**
		 * Delete a theme.
		 */
		$document.on( 'click', '.themes-php.network-admin a.delete', function( event ) {
			var $link = $( event.target ).parents( 'tr' ).prev();
			event.preventDefault();

			if ( ! window.confirm( wp.updates.l10n.aysDelete ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			wp.updates.deleteTheme( $link.attr( 'id' ) );
		} );

		/**
		 * Bulk update for plugins.
		 */
		$bulkActionForm.on( 'click', '[type="submit"]', function( event ) {
			var plugins;

			if ( 'update-selected' !== $( event.target ).siblings( 'select' ).val() ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials( event );
			}

			plugins = [];
			event.preventDefault();

			// Un-check the bulk checkboxes.
			$( '.manage-column [type="checkbox"]' ).prop( 'checked', false );

			// Find all the checkboxes which have been checked.
			$bulkActionForm
				.find( 'input[name="checked[]"]:checked' )
				.each( function( index, element ) {
					var $checkbox = $( element );

					// Un-check the box.
					$checkbox.prop( 'checked', false );

					// Only add updatable plugins to the queue.
					if ( $checkbox.parents( 'tr' ).hasClass( 'update' ) ) {
						plugins.push( {
							plugin: $checkbox.val(),
							slug:   $checkbox.parents( 'tr' ).prop( 'id' )
						} );
					}
			} );

			if ( 0 !== plugins.length ) {
				wp.updates.bulkUpdatePlugins( plugins );
			}
		} );

		/**
		 * Handle events after the credential modal was closed.
		 */
		$document.on( 'credential-modal-cancel', function() {
			var slug, $message;

			if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
				slug     = wp.updates.updateQueue[0].data.slug;
				$message = $( '#' + slug ).next().find( '.update-message' );
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
 		 */
		$document.on( 'wp-progress-updated wp-theme-update-error wp-theme-install-error', function() {
			$( '.notice.is-dismissible' ).each( function() {
				var $el = $( this ),
					$button = $( '<button type="button" class="notice-dismiss"><span class="screen-reader-text"></span></button>' ),
					btnText = window.commonL10n.dismiss || '';

				// Ensure plain text.
				$button.find( '.screen-reader-text' ).text( btnText );
				$button.on( 'click.wp-dismiss-notice', function( event ) {
					event.preventDefault();
					$el.fadeTo( 100, 0, function() {
						$el.slideUp( 100, function() {
							$el.remove();
						} );
					} );
				} );

				$el.append( $button );
			} );
		} );

		$( '#plugin-search-input' ).on( 'keyup search', function() {
			var data = {
					'_ajax_nonce': wp.updates.ajaxNonce,
					's':           $( this ).val()
				};

			if ( 'undefined' !== typeof wp.updates.searchRequest ) {
				wp.updates.searchRequest.abort();
			}

			wp.updates.searchRequest = wp.ajax.post( 'search-plugins', data ).done( function( response ) {
				$theList.empty().append( response.items );
				delete wp.updates.searchRequest;
			} );
		} );
	} );

	/**
	 * Update plugin from the details modal on `plugin-install.php`.
	 *
	 * @since 4.2.0
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
	});

	/**
	 * Handles postMessage events.
	 *
	 * @since 4.2.0
	 * @since 4.5.0 Switched `update-plugin` action to use the updateQueue.
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

	$( window ).on( 'beforeunload', wp.updates.beforeunload );

} )( jQuery, window.wp );
