import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

import type { DeliveryResult } from '../../shared/ipc';
import type { DictationPipelineDeps } from '../pipeline/dictation-pipeline';

const execFileAsync = promisify(execFile);

export interface LocalAiConfig {
  ffmpegBin: string;
  whisperCliBin: string;
  whisperModelPath: string;
  ollamaBin: string;
  ollamaModel: string;
}

export function defaultLocalAiConfig(): LocalAiConfig {
  return {
    ffmpegBin: process.env.OPENTYPELESS_FFMPEG_BIN ?? 'ffmpeg',
    whisperCliBin: process.env.OPENTYPELESS_WHISPER_BIN ?? 'whisper-cli',
    whisperModelPath:
      process.env.OPENTYPELESS_WHISPER_MODEL ??
      join(homedir(), '.cache', 'opentypeless', 'models', 'whisper', 'ggml-base.en.bin'),
    ollamaBin: process.env.OPENTYPELESS_OLLAMA_BIN ?? 'ollama',
    ollamaModel: process.env.OPENTYPELESS_OLLAMA_MODEL ?? 'qwen2.5:0.5b'
  };
}

export function createLocalAiPipelineDeps(dataRoot: string, config: LocalAiConfig = defaultLocalAiConfig()): DictationPipelineDeps {
  return {
    transcribeAudio: async (audioRelativePath, session) => {
      await ensureLocalAiReady(config);

      const sourceAudioPath = join(dataRoot, audioRelativePath);
      const normalizedRelativePath = join('derived', `${session.id}.wav`);
      const normalizedAudioPath = join(dataRoot, normalizedRelativePath);
      const outputPrefix = join(dataRoot, 'derived', session.id);

      await execFileAsync(config.ffmpegBin, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        sourceAudioPath,
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        normalizedAudioPath
      ]);

      await execFileAsync(config.whisperCliBin, [
        '-m',
        config.whisperModelPath,
        '-l',
        'en',
        '-nt',
        '-otxt',
        '-of',
        outputPrefix,
        normalizedAudioPath
      ], { maxBuffer: 16 * 1024 * 1024 });

      const transcriptPath = `${outputPrefix}.txt`;
      const transcript = normalizeWhisperText(await readFile(transcriptPath, 'utf8'));

      return {
        transcript,
        normalizedAudioRelativePath: relative(dataRoot, normalizedAudioPath),
        model: `whisper.cpp:${config.whisperModelPath.split('/').pop() ?? 'model'}`
      };
    },

    rewriteTranscript: async (transcript) => {
      await ensureLocalAiReady(config);

      const prompt = [
        'You rewrite raw spoken dictation into a send-ready chat message.',
        'Keep the original meaning.',
        'Remove filler words and repeated phrases.',
        'Add punctuation and capitalization.',
        'Do not add new facts.',
        'Return only the final message.',
        '',
        'Raw dictation:',
        transcript
      ].join('\n');

      const { stdout } = await execFileAsync(
        config.ollamaBin,
        ['run', config.ollamaModel, prompt],
        { maxBuffer: 16 * 1024 * 1024 }
      );

      return {
        text: normalizeOllamaText(stdout),
        model: `ollama:${config.ollamaModel}`
      };
    },

    simulateSend: async (message): Promise<DeliveryResult> => ({
      channel: 'simulated-chat',
      deliveredText: message.trim(),
      deliveredAt: new Date().toISOString()
    })
  };
}

export async function ensureLocalAiReady(config: LocalAiConfig = defaultLocalAiConfig()): Promise<void> {
  await Promise.all([
    ensureExecutable(config.ffmpegBin, ['-version'], 'ffmpeg is required. Run `npm run ai:setup` in apps/desktop.'),
    ensureExecutable(config.whisperCliBin, ['--help'], 'whisper.cpp is required. Run `npm run ai:setup` in apps/desktop.'),
    ensureExecutable(config.ollamaBin, ['--version'], 'Ollama is required. Run `npm run ai:setup` in apps/desktop.'),
    ensureFile(config.whisperModelPath, `Whisper model missing at ${config.whisperModelPath}. Run \`npm run ai:setup\` in apps/desktop.`)
  ]);

  try {
    await execFileAsync(config.ollamaBin, ['show', config.ollamaModel], { maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error(`Ollama model ${config.ollamaModel} is not available. Run \`npm run ai:setup\` in apps/desktop.`);
  }
}

async function ensureExecutable(bin: string, args: string[], message: string): Promise<void> {
  try {
    await execFileAsync(bin, args, { maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error(message);
  }
}

async function ensureFile(path: string, message: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(message);
  }
}

function normalizeWhisperText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .trim();
}

function normalizeOllamaText(text: string): string {
  return text.trim().replace(/^"|"$/g, '');
}
