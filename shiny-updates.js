window.wp = window.wp || {};

(function( $, wp ) {

	wp.ShinyUpdates = {};

	wp.ShinyUpdates.updatePlugin = function( plugin, pluginDir ) {
		var $message = $( '#' + pluginDir + ' ~ .plugin-update-tr .update-message' ).first();
		var data = {
			'action':      'shiny_plugin_update',
			'_ajax_nonce': shinyUpdates.ajax_nonce,
			'plugin':      plugin,
			'pluginDir':   pluginDir
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
			var $message = $( '#' + response.data.pluginDir + ' ~ .plugin-update-tr .update-message' ).first();

			$message.removeClass( 'updating-message' ).addClass( 'updated-message' );
			$message.text( shinyUpdates.updatedText );
		}
	};

	wp.ShinyUpdates.updateError = function( xhr, status, error ) {
		console.log( error );
	};

	$( document ).ready( function() {
		$( '.update-message a' ).on( 'click', function( e ) {
			var link = e.target.href;

			// TODO: This can obviously be nicer when incorporated into core.
			var re = /\/update.php\?action=upgrade-plugin&plugin=(([^%]+)(%2F[^&]+)?)/;
			var found = link.match( re );

			if ( ! found || found.length < 3 ) {
				return;
			}

			e.preventDefault();
			wp.ShinyUpdates.updatePlugin( found[1], decodeURI( found[2] ) );
		});
	});

})( jQuery, window.wp );
