#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_MODEL_DIR="${OPENTYPELESS_MODEL_DIR:-$HOME/.cache/opentypeless/models/whisper}"
WHISPER_MODEL_PATH="${OPENTYPELESS_WHISPER_MODEL:-$WHISPER_MODEL_DIR/ggml-base.en.bin}"
OLLAMA_MODEL="${OPENTYPELESS_OLLAMA_MODEL:-qwen2.5:0.5b}"
WHISPER_MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"

install_formula() {
  local formula="$1"
  if ! brew list --formula "$formula" >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install "$formula"
  fi
}

install_formula ffmpeg
install_formula whisper-cpp
install_formula ollama

brew services start ollama >/dev/null 2>&1 || true

mkdir -p "$WHISPER_MODEL_DIR"
if [ ! -f "$WHISPER_MODEL_PATH" ]; then
  curl -L "$WHISPER_MODEL_URL" -o "$WHISPER_MODEL_PATH"
fi

if ! ollama show "$OLLAMA_MODEL" >/dev/null 2>&1; then
  ollama pull "$OLLAMA_MODEL"
fi

echo "Local AI runtime is ready."
echo "whisper model: $WHISPER_MODEL_PATH"
echo "ollama model: $OLLAMA_MODEL"
echo "workspace: $ROOT_DIR"
