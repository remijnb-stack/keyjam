// A soft clipper for the master output. Unlike a compressor it has no
// look-ahead, so it adds no delay: quiet sounds pass untouched, and only
// peaks above the knee are rounded off instead of clipping harshly.

/**
 * Curve for a WaveShaperNode. The shaper maps input -1..1 onto the curve,
 * so feed it the signal scaled by 1 / `range` to handle peaks up to `range`.
 * Output = input below `knee`, then bends smoothly towards 1.
 */
export function softClipCurve(size = 2048, range = 2, knee = 0.7): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = ((i / (size - 1)) * 2 - 1) * range;
    const magnitude = Math.abs(x);
    const y = magnitude <= knee ? magnitude : knee + (1 - knee) * Math.tanh((magnitude - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
