window.wp = window.wp || {};

(function( $, wp ) {

	/**
	 * Add id attribute in theme.js.
	 */
	wp.themes.view.Theme = wp.themes.view.Theme.extend({
		initialize: function(){
			this.model.on( 'change', this.render, this );
		},

		render: function() {
			var data = this.model.toJSON();
			// Render themes using the html template
			this.$el.html( this.html( data ) ).attr({
				tabindex: 0,
				'aria-describedby' : data.id + '-action ' + data.id + '-name',
				'id': data.id
			});

			// Renders active theme styles
			this.activeTheme();

			if ( this.model.get( 'displayAuthor' ) ) {
				this.$el.addClass( 'display-author' );
			}

			if ( this.model.get( 'installed' ) ) {
				this.$el.addClass( 'is-installed' );
			}
		},

		events: {
			'click': wp.themes.isInstall ? 'preview': 'expand',
			'keydown': wp.themes.isInstall ? 'preview': 'expand',
			'touchend': wp.themes.isInstall ? 'preview': 'expand',
			'keyup': 'addFocus',
			'touchmove': 'preventExpand',
			'click .theme-install': 'installTheme'
		},

		installTheme: function( event ) {
			var _this = this;
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials();
			}

			wp.updates.installTheme( $( event.target ).data( 'slug' ) )
				.done( function() {
					_this.model.set({ 'installed': true });
				});
		}
	});

	wp.themes.view.Details = wp.themes.view.Details.extend({
		events: {
			'click': 'collapse',
			'click .delete-theme': 'deleteTheme',
			'click .left': 'previousTheme',
			'click .right': 'nextTheme',
			'click #update-theme': 'updateTheme'
		},

		updateTheme: function( event ) {
			event.preventDefault();

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials();
			}

			wp.updates.updateTheme( $( event.target ).data( 'slug' ) );
		}
	});


	wp.themes.view.Preview = wp.themes.view.Preview.extend({
		html: wp.themes.template( 'shiny-theme-preview' ),

		events: {
			'click .close-full-overlay': 'close',
			'click .collapse-sidebar': 'collapse',
			'click .previous-theme': 'previousTheme',
			'click .next-theme': 'nextTheme',
			'keyup': 'keyEvent',
			'click .theme-install': 'installTheme'
		},

		installTheme: function( event ) {
			var _this  = this,
				target = $( event.target );
			event.preventDefault();

			if ( target.hasClass( 'disabled' ) ) {
				return;
			}

			if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.updateLock ) {
				wp.updates.requestFilesystemCredentials();
			}

			wp.updates.installTheme( target.data( 'slug' ) )
				.done( function() {
					_this.model.set({ 'installed': true });
				});
		}
	});

})( jQuery, window.wp );
