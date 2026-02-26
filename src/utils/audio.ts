export async function processAudio(file: File, dbIncrease: number, bitrate: number = 128): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    throw new Error('Failed to decode audio file. It might be unsupported or corrupted.');
  }

  const gain = Math.pow(10, dbIncrease / 20);

  // Apply gain to each channel
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] *= gain;
    }
  }

  // Convert to MP3
  return audioBufferToMp3(audioBuffer, bitrate);
}

function audioBufferToMp3(buffer: AudioBuffer, kbps: number): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  
  // lamejs Mp3Encoder expects Int16Array data
  // Convert Float32Array to Int16Array
  const leftChannel = buffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? buffer.getChannelData(1) : leftChannel;

  const sampleBlockSize = 1152; // multiple of 576
  const leftInt16 = new Int16Array(leftChannel.length);
  const rightInt16 = new Int16Array(rightChannel.length);

  for (let i = 0; i < leftChannel.length; i++) {
    let sampleL = leftChannel[i];
    sampleL = Math.max(-1, Math.min(1, sampleL));
    leftInt16[i] = sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF;

    if (numChannels > 1) {
      let sampleR = rightChannel[i];
      sampleR = Math.max(-1, Math.min(1, sampleR));
      rightInt16[i] = sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF;
    }
  }

  const lamejs = (window as any).lamejs;
  if (!lamejs || !lamejs.Mp3Encoder) {
    throw new Error('lamejs library is not loaded properly.');
  }

  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const mp3Data: Int8Array[] = [];

  for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
    const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
    const rightChunk = numChannels > 1 ? rightInt16.subarray(i, i + sampleBlockSize) : leftChunk;
    
    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

