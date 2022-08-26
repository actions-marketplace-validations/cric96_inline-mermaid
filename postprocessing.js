name: Test

on:
  push:
    branches-ignore:
      - 'renovate/**'
  pull_request:
  workflow_dispatch:

jobs:
  test:
    strategy:
      matrix:
        os: [windows, macos, ubuntu]
    runs-on: ${{ matrix.os }}-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3.0.2
        with:
          path: 'action'
      - name: Trick Renovate
        id: trick
        shell: bash
        run: |
          # Idea: the regex matcher of Renovate keeps this string up to date automatically
          # The version is extracted and used to access the correct version of the scripts
          USES=$(cat <<TRICK_RENOVATE
          - uses: DanySK/Template-for-Gradle-Plugins@3d6625653b9224337bca9ce3ea5c014700813290
          TRICK_RENOVATE
          )
          echo "Scripts update line: \"$USES\""
          echo "Computed version: \"${USES#*@}\""
          echo "::set-output name=version::${USES#*@}"
     # - name: Checkout test repo
     #   uses: actions/checkout@v3.0.2
     #   with:
     #     repository: DanySK/Template-for-Gradle-Plugins
     #     path: 'target'
     #     ref: ${{ steps.trick.outputs.version }}
     # - uses: ./action
     #   with:
     #     build-command: ./gradlew tasks
     #     check-command: true
     #     working-directory: target
     #     should-run-codecov: false
     #     clean-command: ./gradlew clean
     # - uses: ./action
     #   with:
     #     working-directory: target
     #     should-run-codecov: false
     # TODO! put the example here
  release:
    if: github.event_name == 'push'
    needs:
      - test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3.0.2
      - name: Semantic Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          npm install
          npx semantic-release
