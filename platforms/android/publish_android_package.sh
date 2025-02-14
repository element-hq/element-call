#!/usr/bin/env bash

EC_ASSETS_FOLDER=lib/src/main/assets/element-call
CURRENT_DIR=$( dirname -- "${BASH_SOURCE[0]}" )

pushd $CURRENT_DIR > /dev/null

function build_assets() {
	echo "Building the assets..."
	pushd ../..  > /dev/null
	yarn build
	popd  > /dev/null
}

function copy_assets() {
	if [ ! -d $EC_ASSETS_FOLDER ]; then
		echo "Creating $EC_ASSETS_FOLDER..."
		mkdir -p $EC_ASSETS_FOLDER
	fi

	echo "Copying generated assets to the Android project..."
	cp -R ../../dist/* $EC_ASSETS_FOLDER

	echo "Cleaning up copied assets..."
	# Remove .gz assets as they will be marked as duplicate by the Android packaging process
	rm $EC_ASSETS_FOLDER/index.html.gz 2> /dev/null
	rm $EC_ASSETS_FOLDER/assets/*.gz 2> /dev/null
}

getopts :sh opt
case $opt in 
	s)
		echo "Using existing assets."
		SKIP=1
		;;
	h)
		echo "-s: will skip building the assets and just publish the library."
		exit 0
		;;
esac

if [ -d $EC_ASSETS_FOLDER ]; then
	if [ ! $SKIP ]; then
		read -p "Do you want to re-build the assets (y/n, defaults to no)? " -n 1 -r
		echo ""
		if [[ $REPLY =~ ^[Yy]$ ]]; then
		    build_assets
		else 
			echo "Using existing assets."
		fi
	fi
	copy_assets
else
	build_assets
	copy_assets
fi

echo "Publishing the Android project"
./gradlew publishAllPublicationsToGithubPackagesRepository

popd  > /dev/null