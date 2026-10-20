#!/bin/sh
# Runs the security-rule tests in the Firebase emulators. Needs Java (a copy lives in ~/.local/jdk21).
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk21/Contents/Home}" PATH="$HOME/.local/jdk21/Contents/Home/bin:$PATH"
exec ~/.npm-global/bin/firebase emulators:exec --only firestore,storage --project pvrs-rules-test "node tests/rules.test.mjs"
