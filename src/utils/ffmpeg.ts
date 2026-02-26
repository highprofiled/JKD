import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegPromise: Promise<FFmpeg> | null = null;
let isProcessing = false;
const processingQueue: (() => void)[] = [];
let lastFfmpegLogs = '';

async function acquireLock(): Promise<void> {
  if (!isProcessing) {
    isProcessing = true;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    processingQueue.push(resolve);
  });
}

function releaseLock() {
  if (processingQueue.length > 0) {
    const next = processingQueue.shift();
    if (next) next();
  } else {
    isProcessing = false;
  }
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) {
    return ffmpegPromise;
  }

  ffmpegPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg();
      
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
        lastFfmpegLogs += message + '\n';
        // Keep only last 1000 characters to avoid memory issues
        if (lastFfmpegLogs.length > 2000) {
          lastFfmpegLogs = lastFfmpegLogs.substring(lastFfmpegLogs.length - 1000);
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      // Load ffmpeg
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      return ffmpeg;
    } catch (err) {
      ffmpegPromise = null;
      throw err;
    }
  })();

  return ffmpegPromise;
}

export async function processAudioWithFFmpeg(
  file: File,
  dbIncrease: number,
  format: string,
  bitrate: number,
  sampleRate: number,
  bitrateMode: 'cbr' | 'vbr',
  vbrQuality: number,
  reducePeaksDb: number,
  startTime?: number,
  endTime?: number
): Promise<Blob> {
  await acquireLock();
  
  try {
    const ff = await getFFmpeg();
    
    const inputName = `input_${Date.now()}.${file.name.split('.').pop() || 'tmp'}`;
    const outputName = `output_${Date.now()}.${format}`;

    // Write file to ffmpeg FS
    await ff.writeFile(inputName, await fetchFile(file));

    // Build ffmpeg command
    const args: string[] = ['-y']; // Always overwrite output files
    
    // Input
    args.push('-i', inputName);

    // Disable video, subtitles, and data streams (audio only)
    args.push('-vn', '-sn', '-dn');

    // Prevent memory issues with some formats
    args.push('-max_muxing_queue_size', '1024');

    // Cropping
    if (startTime !== undefined && endTime !== undefined) {
      if (endTime > startTime) {
        // Only apply cropping if it's not the default 0 to 0
        if (startTime > 0 || endTime > 0) {
          args.push('-ss', startTime.toString());
          args.push('-to', endTime.toString());
        }
      }
    }

    // Volume and Peaks filter
    const audioFilters: string[] = [];
    if (dbIncrease !== 0) {
      audioFilters.push(`volume=${dbIncrease}dB`);
    }
    if (reducePeaksDb > 0) {
      audioFilters.push(`alimiter=limit=-${reducePeaksDb}dB:attack=5:release=50`);
    }
    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    // Sample Rate
    let finalSampleRate = sampleRate;
    if (format === 'mp3' && finalSampleRate > 48000) {
      finalSampleRate = 48000; // MP3 max sample rate is 48kHz
    }
    if (finalSampleRate) {
      args.push('-ar', finalSampleRate.toString());
    }

    // Bitrate and Codec
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame');
      if (bitrateMode === 'vbr') {
        args.push('-q:a', vbrQuality.toString());
      } else {
        args.push('-b:a', `${bitrate}k`);
      }
    } else if (format === 'ogg') {
      args.push('-c:a', 'libvorbis');
      if (bitrateMode === 'vbr') {
        args.push('-q:a', Math.max(0, 10 - vbrQuality).toString());
      } else {
        args.push('-b:a', `${bitrate}k`);
      }
    } else if (format === 'aac' || format === 'm4a') {
      args.push('-c:a', 'aac');
      if (bitrateMode === 'vbr') {
        const aacQ = Math.max(0.1, 2.0 - (vbrQuality * 0.2));
        args.push('-q:a', aacQ.toString());
      } else {
        args.push('-b:a', `${bitrate}k`);
      }
    } else if (format === 'opus') {
      args.push('-c:a', 'libopus');
      if (bitrateMode === 'vbr') {
        args.push('-vbr', 'on');
      } else {
        args.push('-vbr', 'off');
      }
      args.push('-b:a', `${bitrate}k`);
    } else if (format === 'wma') {
      args.push('-c:a', 'wmav2');
      args.push('-b:a', `${bitrate}k`);
    } else if (format === 'alac') {
      args.push('-c:a', 'alac');
    } else if (format === 'flac') {
      args.push('-c:a', 'flac');
    } else if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    }

    // Output
    args.push(outputName);

    // Run ffmpeg
    let data: Uint8Array | null = null;
    let crashed = false;
    lastFfmpegLogs = ''; // Clear logs before running
    
    try {
      const ret = await ff.exec(args);
      if (ret !== 0) {
        throw new Error('FFmpeg processing failed with exit code ' + ret + '\nLogs: ' + lastFfmpegLogs);
      }
      // Read output
      data = await ff.readFile(outputName) as Uint8Array;
    } catch (err) {
      crashed = true;
      // If ffmpeg crashed (e.g. signal aborted), we need to terminate it so it gets recreated next time
      try {
        ff.terminate();
      } catch (e) {}
      ffmpegPromise = null;
      
      throw new Error(`FFmpeg Error: ${err instanceof Error ? err.message : 'Unknown error'}. Logs: ${lastFfmpegLogs}`);
    } finally {
      // Clean up if it didn't crash
      if (!crashed) {
        try { await ff.deleteFile(inputName); } catch (e) {}
        try { await ff.deleteFile(outputName); } catch (e) {}
      }
    }

    // Create blob
    let mimeType = `audio/${format}`;
    if (format === 'm4a') mimeType = 'audio/mp4';
    
    return new Blob([data], { type: mimeType });
  } finally {
    releaseLock();
  }
}
