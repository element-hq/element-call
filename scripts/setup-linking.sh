#!/usr/bin/env bash

# Checks if there currently is linking configured. Informs the user to disable linking before committing.

LINKSFILE=.links.cjs
echo "Checking for existing linking configuration in $LINKSFILE..."
if test -f "$LINKSFILE"; then
echo "Linking configuration found in $LINKSFILE."
else
    echo "No $LINKSFILE -> Creating $LINKSFILE with default values. Please edit this file to point to your local checkouts of the dependencies you want to link."
    echo '''// Packages to link to local checkouts
module.exports = {
    "matrix-js-sdk": "../your/path/matrix-js-sdk",
    "matrix-widget-api": "../your/path/matrix-widget-api",
};''' > $LINKSFILE
fi
echo "updating local git hookPath to .githooks"
git config --local core.hooksPath .githooks
echo ""
echo "Setup complete."
echo "Update: .links.cjs to your liking"
echo "Run: 'pnpm links:on' to test your .links.cjs"
echo "Run: 'git commit' with links enabled to test the git pre-commit hook."
echo "Run: 'pnpm links:off' to be able to commit again"
echo "Run: 'git config --local core.hooksPath \"\"' to allow committing with linking on (not recommended)"
echo "Run: 'rm links.cjs' & 'git config --local core.hooksPath \"\"' to fully revert what this script did"
