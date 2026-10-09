/** One context for the night, so the hearth and the distance share a gesture. */
let shared: AudioContext | null = null

export function sharedAudio(): AudioContext {
  if (!shared) shared = new AudioContext()
  if (shared.state === 'suspended') void shared.resume()
  return shared
}
