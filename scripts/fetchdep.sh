#!/usr/bin/env bash

# Clones the branch of a dependency's repository that has the same name as
# the pull request branch under test, so a change spanning both repositories
# can be tested before either side is merged. Inspired by scripts/fetchdep.sh 
# element-web.
#
# Usage: scripts/fetchdep.sh <org> <repo> [ref]
#
# The clone lands in ./<repo>. When the pull request comes from a fork and
# PR_HEAD_REPO_OWNER was set, the fork's own copy of the repository is tried
# before <org>'s. Exits 0 when a branch was cloned and 1 when there is none,
# so the caller can keep the locked version in that case. Without a ref,
# nothing is closed outside a pull request.

set -eu

org=$1
repo=$2
ref=${3:-}

rm -rf "$repo"

# If a ref was passed, try to clone it or die.
if [ -n "$ref" ]; then
    echo "fetchdep.sh: Using $org/$repo at $ref"
    git clone --depth 1 "https://github.com/$org/$repo.git" "$repo"
    git -C "$repo" fetch --depth 1 origin "$ref"
    git -C "$repo" -c advice.detachedHead=false checkout FETCH_HEAD
    git -C "$repo" log -1
    exit 0
fi

# Otherwise ensure that we're on a pull request.
head_ref=${GITHUB_HEAD_REF:-}
if [ -z "$head_ref" ]; then
    echo "fetchdep.sh: Not a pull request, nothing to match"
    exit 1
fi

# Bots name their branches the same way in every repository, so a match on
# one of theirs would be a coincidence rather than a paired change.
case "$head_ref" in
    renovate/* | dependabot/*)
        echo "fetchdep.sh: Not matching bot branch $head_ref"
        exit 1
        ;;
esac

# Clones a branch if it exists and ends the script on success.
clone() {
    local try_org=$1
    local branch=$2
    echo "fetchdep.sh: Trying to use $try_org/$repo#$branch"
    # Disable auth prompts: https://serverfault.com/a/665959
    if GIT_TERMINAL_PROMPT=0 git clone "https://github.com/$try_org/$repo.git" "$repo" --branch "$branch" --depth 1; then
        git -C "$repo" log -1
        # Surface the match on the workflow run summary.
        echo "::notice title=Matched $repo branch::Using $try_org/$repo#$branch at $(git -C "$repo" rev-parse HEAD)"
        exit 0
    fi
}

# Try cloning from the fork, then from the org.
head_owner=${PR_HEAD_REPO_OWNER:-}
if [ -n "$head_owner" ] && [ "$head_owner" != "${GITHUB_REPOSITORY_OWNER:-}" ]; then
    clone "$head_owner" "$head_ref"
fi
clone "$org" "$head_ref"

# Nothing worked. Die.
echo "fetchdep.sh: No branch named $head_ref in $org/$repo"
exit 1
