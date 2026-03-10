#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_MODEL_DIR="${OPENTYPELESS_MODEL_DIR:-$HOME/.cache/opentypeless/models/whisper}"
WHISPER_MODEL_PATH="${OPENTYPELESS_WHISPER_MODEL:-$WHISPER_MODEL_DIR/ggml-base.en.bin}"
REWRITE_MODEL="${OPENTYPELESS_REWRITE_MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
WHISPER_MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"

install_formula() {
  local formula="$1"
  if ! brew list --formula "$formula" >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install "$formula"
  fi
}

install_formula ffmpeg
install_formula whisper-cpp

mkdir -p "$WHISPER_MODEL_DIR"
if [ ! -f "$WHISPER_MODEL_PATH" ]; then
  curl -L "$WHISPER_MODEL_URL" -o "$WHISPER_MODEL_PATH"
fi

cd "$ROOT_DIR"
uv venv .venv --python 3.12 --clear
uv pip install --python .venv/bin/python mlx-lm socksio
.venv/bin/python ./scripts/rewrite_with_mlx.py --model "$REWRITE_MODEL" --prewarm >/dev/null

echo "Local AI runtime is ready."
echo "whisper model: $WHISPER_MODEL_PATH"
echo "rewrite model: $REWRITE_MODEL"
echo "python: $ROOT_DIR/.venv/bin/python"
