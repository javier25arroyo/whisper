export interface AudioTrackLike {
  readyState: string;
}

export interface AudioStreamLike {
  getAudioTracks(): AudioTrackLike[];
}

/** true si no hay stream o todas sus pistas de audio terminaron (llamada, Siri, permiso
 * revocado). Un turno "listening" con un stream muerto no puede cerrarse solo: "Detener
 * grabación" no hace nada porque no hay grabador activo. */
export function isMicDead(stream: AudioStreamLike | null): boolean {
  if (!stream) return true;
  const tracks = stream.getAudioTracks();
  return tracks.length === 0 || tracks.every((t) => t.readyState === "ended");
}
