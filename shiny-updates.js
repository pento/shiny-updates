window.wp = window.wp || {};

(function( $, wp ) {

	// Not needed in core.
	wp.updates = wp.updates || {};

	// Not needed in core.
	wp.updates.l10n = _.extend( wp.updates.l10n, window.shinyUpdates );

	/**
	 * Send an Ajax request to the server to install a plugin.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
	 */
	wp.updates.installPlugin = function( slug ) {
		var $message = $( '.plugin-card-' + slug ).find( '.install-now' ),
			data;

		$message.addClass( 'updating-message' );
		$message.text( wp.updates.l10n.installing );
		wp.a11y.speak( wp.updates.l10n.installingMsg );

		if ( wp.updates.updateLock ) {
			wp.updates.updateQueue.push( {
				type: 'install-plugin',
				data: {
					slug: slug
				}
			} );
			return;
		}

		wp.updates.updateLock = true;

		data = {
			_ajax_nonce:     wp.updates.ajaxNonce,
			slug:            slug,
			username:        wp.updates.filesystemCredentials.ftp.username,
			password:        wp.updates.filesystemCredentials.ftp.password,
			hostname:        wp.updates.filesystemCredentials.ftp.hostname,
			connection_type: wp.updates.filesystemCredentials.ftp.connectionType,
			public_key:      wp.updates.filesystemCredentials.ssh.publicKey,
			private_key:     wp.updates.filesystemCredentials.ssh.privateKey
		};

		wp.ajax.post( 'install-plugin', data )
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
		wp.a11y.speak( wp.updates.l10n.installedMsg );
		wp.updates.updateDoneSuccessfully = true;

		/*
		 * The lock can be released since the update was successful,
		 * and any other updates can commence.
		 */
		wp.updates.updateLock = false;
		wp.updates.queueChecker();
	};

	/**
	 * On plugin install failure, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.installPluginError = function( response ) {
		var $message = $( '.plugin-card-' + response.slug ).find( '.install-now' );

		wp.updates.updateDoneSuccessfully = false;

		if ( response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, 'install-plugin' );
			return;
		}

		$message.removeClass( 'updating-message' );
		$message.text( wp.updates.l10n.installNow );

		wp.updates.updateLock = false;
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
		wp.a11y.speak( wp.updates.l10n.deletinggMsg );

		if ( wp.updates.updateLock ) {
			wp.updates.updateQueue.push( {
				type: 'delete-plugin',
				data: {
					plugin: plugin,
					slug: slug
				}
			} );
			return;
		}

		wp.updates.updateLock = true;

		var data = {
			_ajax_nonce:     wp.updates.ajaxNonce,
			plugin:          plugin,
			slug:            slug,
			username:        wp.updates.filesystemCredentials.ftp.username,
			password:        wp.updates.filesystemCredentials.ftp.password,
			hostname:        wp.updates.filesystemCredentials.ftp.hostname,
			connection_type: wp.updates.filesystemCredentials.ftp.connectionType,
			public_key:      wp.updates.filesystemCredentials.ssh.publicKey,
			private_key:     wp.updates.filesystemCredentials.ssh.privateKey
		};

		wp.ajax.post( 'delete-plugin', data )
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
		wp.a11y.speak( wp.updates.l10n.deletedMsg );
		wp.updates.updateDoneSuccessfully = true;

		// Removes the plugin and updates rows.
		$( '#' + response.slug + '-update, #' + response.id ).css({ backgroundColor:'#faafaa' }).fadeOut( 350, function() {
			$( this ).remove();
		});

		/*
		 * The lock can be released since the update was successful,
		 * and any other updates can commence.
		 */
		wp.updates.updateLock = false;
		wp.updates.queueChecker();
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
			wp.updates.credentialError( response, 'install-plugin' );
			return;
		}

		wp.updates.updateLock = false;
	};

	/**
	 * Send an Ajax request to the server to update a theme.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
	 */
	wp.updates.updateTheme = function( slug ) {
		var $message = $( '#update-theme' ).closest( '.notice' ),
			data;

		$message.addClass( 'updating-message' );
		$message.text( wp.updates.l10n.updating );
		wp.a11y.speak( wp.updates.l10n.updatingMsg );

		if ( wp.updates.updateLock ) {
			wp.updates.updateQueue.push( {
				type: 'update-theme',
					data: {
						slug: slug
					}
			} );
			return;
		}

		wp.updates.updateLock = true;

		data = {
			'_ajax_nonce':   wp.updates.ajaxNonce,
			'slug':          slug,
			username:        wp.updates.filesystemCredentials.ftp.username,
			password:        wp.updates.filesystemCredentials.ftp.password,
			hostname:        wp.updates.filesystemCredentials.ftp.hostname,
			connection_type: wp.updates.filesystemCredentials.ftp.connectionType,
			public_key:      wp.updates.filesystemCredentials.ssh.publicKey,
			private_key:     wp.updates.filesystemCredentials.ssh.privateKey
		};

		wp.ajax.post( 'update-theme', data )
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
		var $message = $( '.theme-info .notice' );

		$message.removeClass( 'updating-message notice-warning' ).addClass( 'updated-message notice-success' );
		$message.text( wp.updates.l10n.updated );
		$( '#' + response.slug ).find( '.theme-update' ).remove();

		wp.a11y.speak( wp.updates.l10n.updatedMsg );

		wp.updates.decrementCount( 'theme' );
		wp.updates.updateDoneSuccessfully = true;

		/*
		 * The lock can be released since the update was successful,
		 * and any other updates can commence.
		 */
		wp.updates.updateLock = false;

		$( document ).trigger( 'wp-plugin-update-success', response );

		wp.updates.queueChecker();
	};

	/**
	 * On a theme update error, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.updateThemeError = function( response ) {
		var $message = $( '.theme-info .notice' );

		$message.removeClass( 'updating-message notice-warning' ).addClass( 'notice-error' );
		$message.text( wp.updates.l10n.updateFailed );
		wp.a11y.speak( wp.updates.l10n.updateFailed );

		// The lock can be released since this failure was after the credentials form.
		wp.updates.updateLock = false;

		$( document ).trigger( 'wp-plugin-update-error', response );

		wp.updates.queueChecker();
	};

	/**
	 * Send an Ajax request to the server to install a theme.
	 *
	 * @since 4.5.0
	 *
	 * @param {string} slug
	 */
	wp.updates.installTheme = function( slug ) {
		var $message = $( '.theme-install[data-slug="' + slug + '"]' ),
			data;

		$message.addClass( 'updating-message' );
		$message.text( wp.updates.l10n.installing );
		wp.a11y.speak( wp.updates.l10n.installingMsg );

		if ( wp.updates.updateLock ) {
			wp.updates.updateQueue.push( {
				type: 'install-theme',
				data: {
					slug: slug
				}
			} );
			return;
		}

		wp.updates.updateLock = true;

		data = {
			'_ajax_nonce':   wp.updates.ajaxNonce,
			'slug':          slug,
			username:        wp.updates.filesystemCredentials.ftp.username,
			password:        wp.updates.filesystemCredentials.ftp.password,
			hostname:        wp.updates.filesystemCredentials.ftp.hostname,
			connection_type: wp.updates.filesystemCredentials.ftp.connectionType,
			public_key:      wp.updates.filesystemCredentials.ssh.publicKey,
			private_key:     wp.updates.filesystemCredentials.ssh.privateKey
		};

		return wp.ajax.post( 'install-theme', data )
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
			$message = $( '.theme-install[data-slug="' + response.slug + '"]' );

		$message.removeClass( 'updating-message' ).addClass( 'updated-message disabled' );
		$message.text( wp.updates.l10n.installed );
		wp.a11y.speak( wp.updates.l10n.installedMsg );
		$card.addClass( 'is-installed' ); // Hides the button, should show banner.

		/*
		 * The lock can be released since the update was successful,
		 * and any other updates can commence.
		 */
		wp.updates.updateLock = false;

		$( document ).trigger( 'wp-plugin-update-success', response );

		wp.updates.queueChecker();
	};

	/**
	 * On theme install failure, update the UI appropriately.
	 *
	 * @since 4.5.0
	 *
	 * @param {object} response
	 */
	wp.updates.installThemeError = function( response ) {
		var $message = $( '#' + response.slug ).find( '.theme-install' );

		$message.removeClass( 'updating-message' );
		$message.text( wp.updates.l10n.installNow );

		// The lock can be released since this failure was after the credentials form.
		wp.updates.updateLock = false;

		$( document ).trigger( 'wp-plugin-update-error', response );

		wp.updates.queueChecker();
	};

	/**
	 * If an install/update job has been placed in the queue, queueChecker pulls it out and runs it.
	 *
	 * @since 4.2.0
	 * @since 4.5.0 Can handle multiple job types.
	 */
	wp.updates.queueChecker = function() {
		if ( wp.updates.updateLock || wp.updates.updateQueue.length <= 0 ) {
			return;
		}

		var job = wp.updates.updateQueue.shift();

		switch ( job.type ) {
			case 'update-plugin':
				wp.updates.updatePlugin( job.data.plugin, job.data.slug );
				break;

			case 'install-plugin':
				wp.updates.installPlugin( job.data.slug );
				break;

			case 'update-theme':
				wp.updates.updateTheme( job.data.slug );
				break;

			case 'install-theme':
				wp.updates.installTheme( job.data.slug );
				break;

			default:
				window.console.log( 'Failed to execute queued update job.', job );
				break;
		}
	};

	$( function() {
		var pluginList = $( '#the-list' );

		pluginList.find( '.install-now' ).on( 'click', function( event ) {
			var $button = $( event.target );
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials();
			}

			if ( $button.hasClass( 'button-disabled' ) ) {
				return;
			}

			wp.updates.installPlugin( $button.data( 'slug' ) );
		} );

		pluginList.find( '.delete' ).on( 'click', 'a', function( event ) {
			var $link = $( event.target );
			event.preventDefault();

			if ( ! confirm( wp.updates.l10n.aysDelete ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials();
			}

			wp.updates.deletePlugin( $link.data( 'plugin' ), $link.data( 'slug' ) );
		} );
	});

})( jQuery, window.wp );
