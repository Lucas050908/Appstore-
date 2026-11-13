name: Byg __NAME__ APK

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ["apps/__ID__/**", "shared/repack.py", ".github/workflows/build-__ID__.yml"]

permissions:
  contents: write

concurrency:
  group: build-__ID__
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Ompak, zipalign og signer
        env:
          KEYSTORE_PASSWORD: "7BzhKh3fj9JiufNfLn7HHjco"
        run: |
          set -eo pipefail
          {
            VER=$(python3 -c "import json;print(json.load(open('apps/__ID__/repack.json'))['version'])")
            python3 shared/repack.py apps/__ID__/repack.json /tmp/unsigned.apk
            BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
            echo "build-tools: $BT"
            "$BT/zipalign" -f -p 4 /tmp/unsigned.apk /tmp/aligned.apk
            rm -f apks/__FILE__-*.apk
            "$BT/apksigner" sign --ks android/signing/release.jks --ks-key-alias appstore --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD --out "apks/__FILE__-$VER.apk" /tmp/aligned.apk
            rm -f "apks/__FILE__-$VER.apk.idsig"
            "$BT/apksigner" verify --verbose --print-certs "apks/__FILE__-$VER.apk" | head -12
            "$BT/zipalign" -c -v 4 "apks/__FILE__-$VER.apk" | tail -2
          } 2>&1 | tee /tmp/build.log

      - name: Gem byggelog ved fejl
        if: failure()
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898283+github-actions[bot]@users.noreply.github.com"
          mkdir -p /tmp/logs && cp /tmp/build.log /tmp/logs/__ID__.log 2>/dev/null || echo "ingen log" > /tmp/logs/__ID__.log
          git stash -u || true
          git fetch origin ci-logs && git checkout ci-logs || git checkout --orphan ci-logs
          git rm -rf --quiet . 2>/dev/null || true
          tail -c 400000 /tmp/logs/__ID__.log > __ID__.log
          git add __ID__.log && git commit -m "Byggelog ${{ github.sha }}" && git push origin ci-logs

      - name: Læg APK i apks/ og opdater butikken
        run: |
          VER=$(python3 -c "import json;print(json.load(open('apps/__ID__/repack.json'))['version'])")
          APK=apks/__FILE__-$VER.apk
          ls -la "$APK"
          pip install --quiet androguard pillow
          python3 add_app.py "$APK" store --download "https://raw.githubusercontent.com/Lucas050908/Appstore-/main/$APK"
          git config user.name "github-actions[bot]"
          git config user.email "41898283+github-actions[bot]@users.noreply.github.com"
          git add -A apks store/apps.json store/icons
          git diff --cached --quiet || git commit -m "Byg __NAME__ $VER (${{ github.sha }})"
          for i in $(seq 1 12); do git pull --rebase origin main && git push && break; sleep $((RANDOM % 25 + 5)); done
