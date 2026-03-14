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
  pythonBin: string;
  rewriteScriptPath: string;
  rewriteModel: string;
}

export function defaultLocalAiConfig(): LocalAiConfig {
  return {
    ffmpegBin: process.env.OPENTYPELESS_FFMPEG_BIN ?? 'ffmpeg',
    whisperCliBin: process.env.OPENTYPELESS_WHISPER_BIN ?? 'whisper-cli',
    whisperModelPath:
      process.env.OPENTYPELESS_WHISPER_MODEL ??
      join(homedir(), '.cache', 'opentypeless', 'models', 'whisper', 'ggml-base.en.bin'),
    pythonBin: process.env.OPENTYPELESS_PYTHON_BIN ?? join(process.cwd(), '.venv', 'bin', 'python'),
    rewriteScriptPath:
      process.env.OPENTYPELESS_REWRITE_SCRIPT ??
      join(process.cwd(), 'scripts', 'rewrite_with_mlx.py'),
    rewriteModel:
      process.env.OPENTYPELESS_REWRITE_MODEL ?? 'mlx-community/Qwen2.5-0.5B-Instruct-4bit',
  };
}

export function createLocalAiPipelineDeps(
  dataRoot: string,
  config: LocalAiConfig = defaultLocalAiConfig(),
): DictationPipelineDeps {
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
        normalizedAudioPath,
      ]);

      await execFileAsync(
        config.whisperCliBin,
        [
          '-m',
          config.whisperModelPath,
          '-l',
          'en',
          '-nt',
          '-otxt',
          '-of',
          outputPrefix,
          normalizedAudioPath,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      );

      const transcriptPath = `${outputPrefix}.txt`;
      const transcript = normalizeWhisperText(await readFile(transcriptPath, 'utf8'));

      return {
        transcript,
        normalizedAudioRelativePath: relative(dataRoot, normalizedAudioPath),
        model: `whisper.cpp:${config.whisperModelPath.split('/').pop() ?? 'model'}`,
      };
    },

    rewriteTranscript: async (transcript) => {
      await ensureLocalAiReady(config);

      const { stdout } = await execFileAsync(
        config.pythonBin,
        [config.rewriteScriptPath, '--model', config.rewriteModel, '--text', transcript],
        { maxBuffer: 16 * 1024 * 1024 },
      );

      return {
        text: normalizeRewriteText(stdout),
        model: `mlx-lm:${config.rewriteModel}`,
      };
    },

    simulateSend: async (message): Promise<DeliveryResult> => ({
      channel: 'simulated-chat',
      deliveredText: message.trim(),
      deliveredAt: new Date().toISOString(),
    }),
  };
}

export async function ensureLocalAiReady(
  config: LocalAiConfig = defaultLocalAiConfig(),
): Promise<void> {
  await Promise.all([
    ensureExecutable(
      config.ffmpegBin,
      ['-version'],
      'ffmpeg is required. Run `npm run ai:setup` in apps/desktop.',
    ),
    ensureExecutable(
      config.whisperCliBin,
      ['--help'],
      'whisper.cpp is required. Run `npm run ai:setup` in apps/desktop.',
    ),
    ensureExecutable(
      config.pythonBin,
      ['--version'],
      'Local Python runtime is required. Run `npm run ai:setup` in apps/desktop.',
    ),
    ensureFile(
      config.whisperModelPath,
      `Whisper model missing at ${config.whisperModelPath}. Run \`npm run ai:setup\` in apps/desktop.`,
    ),
    ensureFile(config.rewriteScriptPath, `Rewrite script missing at ${config.rewriteScriptPath}.`),
  ]);
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

function normalizeRewriteText(text: string): string {
  return text.trim().replace(/^"|"$/g, '');
}
