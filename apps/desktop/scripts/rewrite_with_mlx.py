#!/usr/bin/env python3
import argparse

from mlx_lm import generate, load

SYSTEM_PROMPT = """You rewrite raw spoken dictation into a send-ready chat message.
Keep the original meaning.
Remove filler words and repeated phrases.
Add punctuation and capitalization.
Do not add new facts.
Return only the final message.
"""


def build_prompt(tokenizer, text: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ]
    return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--text", default="")
    parser.add_argument("--prewarm", action="store_true")
    args = parser.parse_args()

    model, tokenizer = load(args.model)

    if args.prewarm:
        print("ready")
        return

    prompt = build_prompt(tokenizer, args.text)
    result = generate(model, tokenizer, prompt=prompt, max_tokens=128, verbose=False)
    print(result.strip())


if __name__ == "__main__":
    main()
