<?php
/**
 * Plugin Name: Shiny Updates
 * Plugin URI: https://github.com/obenland/shiny-updates
 * Description: A smoother experience for managing plugins and themes.
 * Author: the WordPress team
 * Author URI: https://github.com/obenland/shiny-updates
 * Version: 2
 * License: GPL2
 *
 * @package Shiny_Updates
 */

include_once 'src/class-shiny-updates.php';
include_once 'src/ajax-actions.php';
include_once 'src/update.php';

add_action( 'init', array( 'Shiny_Updates', 'init' ) );
