# Runtime-harness themes (not part of the converter package).
#
# Hello Elementor is bind-mounted into the WordPress container so Elementor
# Full Width (`elementor_header_footer`) can call classic header.php/footer.php.
#
# Install / refresh:
#   bash docker/scripts/ensure-hello-elementor.sh
# Or set HELLO_ELEMENTOR_PATH to an existing Hello Elementor theme directory.
#
# The extracted theme under hello-elementor/ is gitignored; setup downloads it
# when missing (requires network once, or a local HELLO_ELEMENTOR_PATH).
