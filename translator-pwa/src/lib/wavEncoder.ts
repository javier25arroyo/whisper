export const TARGET_SAMPLE_RATE = 16000;

/** Escribe una cadena ASCII byte a byte en la posición indicada. */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Convierte muestras Float32 mono a un WAV PCM de 16 bits. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits por muestra
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  for (let i = 0; i < samples.length; i++) {
    // El rango de Int16 es asimétrico: -1 mapea a -32768 y 1 a 32767.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const pcm = clamped < 0 ? clamped * 32768 : clamped * 32767;
    view.setInt16(44 + i * bytesPerSample, Math.round(pcm), true);
  }

  return buffer;
}

/**
 * Decodifica el audio grabado por MediaRecorder y lo reescribe como WAV mono a 16 kHz.
 * Solo se usa con proveedores que no admiten el formato nativo del navegador.
 */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE)], {
      type: "audio/wav",
    });
  } finally {
    await context.close();
  }
}
