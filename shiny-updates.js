window.wp = window.wp || {};

(function( $, wp ) {

	wp.ShinyUpdates = {};

	wp.ShinyUpdates.updatePlugin = function( plugin, slug ) {
		var $message = $( '#' + slug ).next().find( '.update-message' );
		var data = {
			'action':      'shiny_plugin_update',
			'_ajax_nonce': shinyUpdates.ajax_nonce,
			'plugin':      plugin,
			'slug':        slug
		};

		$.ajax({
			type:     'post',
			dataType: 'json',
			url:       ajaxurl,
			data:      data,
			success:   wp.ShinyUpdates.updateSuccess,
			error:     wp.ShinyUpdates.updateError
		});

		$message.addClass( 'updating-message' );
		$message.text( shinyUpdates.updatingText );
	};

	wp.ShinyUpdates.updateSuccess = function( response, status, xhr ) {
		if ( response.success ) {
			var $message = $( '#' + response.data.slug ).next().find( '.update-message' );

			$message.removeClass( 'updating-message' ).addClass( 'updated-message' );
			$message.text( shinyUpdates.updatedText );
		}
	};

	wp.ShinyUpdates.updateError = function( xhr, status, error ) {
		console.log( error );
	};

	wp.ShinyUpdates.installPlugin = function( slug ) {
		var data = {
			'action':      'shiny_plugin_install',
			'_ajax_nonce': shinyUpdates.ajax_nonce,
			'slug':        slug
		};

		$.ajax({
			type:     'post',
			dataType: 'json',
			url:       ajaxurl,
			data:      data,
			success:   wp.ShinyUpdates.installSuccess,
			error:     wp.ShinyUpdates.installError
		});

		$container = $( '#' + slug + '-card .install-now' ).parent();
		$container.html( '<span class="button button-disabled installing">' + shinyUpdates.installingText + '</span>' );
	}

	wp.ShinyUpdates.installSuccess = function( response, status, xhr ) {
		if ( response.success ) {
			$button = $( '#' + response.data.slug + '-card .installing' );
			$button.removeClass( 'installing' ).addClass( 'installed' );
			$button.text( shinyUpdates.installedText );
		}
	};

	wp.ShinyUpdates.installError = function( xhr, status, error ) {
		console.log( error );
	};


	$( document ).ready( function() {
		$( '.update-message a' ).on( 'click', function( e ) {
			var link = e.target.href;

			var $row = $( e.target ).parents( 'tr' ).prev();

			// TODO: This can obviously be nicer when incorporated into core.
			var re = /\/update.php\?action=upgrade-plugin&plugin=([^&]+)/;
			var found = link.match( re );

			if ( ! found || found.length < 2 ) {
				return;
			}

			e.preventDefault();
			wp.ShinyUpdates.updatePlugin( found[1], $row.prop( 'id' ) );
		});

		$( '.plugin-card .install-now' ).on( 'click', function( e ) {
			var link = e.target.href;

			var $row = $( e.target ).parents( 'tr' ).prev();

			// TODO: This can obviously be nicer when incorporated into core.
			var re = /\/update.php\?action=install-plugin&plugin=([^&]+)/;
			var found = link.match( re );

			if ( ! found || found.length < 2 ) {
				return;
			}

			$( e.target ).parents( '.plugin-card' ).attr( 'id', found[1] + '-card' );

			e.preventDefault();
			wp.ShinyUpdates.installPlugin( found[1] );
		});
	});

})( jQuery, window.wp );
