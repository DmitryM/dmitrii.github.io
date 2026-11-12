// Hydrogen eigenstate particle cloud. Each particle carries one sample of |ψ|² per state;
// uState (continuous) selects the segment [k, k+1] and the per-particle progress within it.
#include "../../shaders/common.glsl"
#include "../../shaders/noise.glsl"

#ifndef NUM_STATES
#define NUM_STATES 4
#endif

in vec3 aS0;
#if NUM_STATES > 1
in vec3 aS1;
#endif
#if NUM_STATES > 2
in vec3 aS2;
#endif
#if NUM_STATES > 3
in vec3 aS3;
#endif
#if NUM_STATES > 4
in vec3 aS4;
#endif
#if NUM_STATES > 5
in vec3 aS5;
#endif
in float aSigns;
in float aSeed;

uniform float uState;
uniform float uTime;
uniform float uPointPx; // on-screen size at the camera's focus distance
uniform float uCamDist;
uniform float uViewportH;
uniform float uShrink;
uniform float uIntensity;
uniform float uFlight;
uniform float uBurst; // 0 = all of the vacuum sits in the singularity point, 1 = fully expanded
uniform float uPulse; // brief brightening at a quantum jump
uniform vec3 uColorPos;
uniform vec3 uColorNeg;
uniform vec3 uColorVac;

out vec3 vColor;
out float vAlpha;

vec3 statePos(int i) {
#if NUM_STATES > 1
  if (i == 1) return aS1;
#endif
#if NUM_STATES > 2
  if (i == 2) return aS2;
#endif
#if NUM_STATES > 3
  if (i == 3) return aS3;
#endif
#if NUM_STATES > 4
  if (i == 4) return aS4;
#endif
#if NUM_STATES > 5
  if (i == 5) return aS5;
#endif
  return aS0;
}

float stateSign(int i) {
  return mod(floor(aSigns / exp2(float(i)) + 1e-3), 2.0);
}

vec3 stateColor(int i) {
  vec3 c = mix(uColorNeg, uColorPos, stateSign(i));
  return i == 0 ? uColorVac : c;
}

void main() {
  float s = clamp(uState, 0.0, float(NUM_STATES - 1) - 1e-4);
  int seg = int(floor(s));
  float t = s - float(seg);

  vec3 a = statePos(seg);
  vec3 b = statePos(seg + 1);
  // the vacuum bursts out of the point the sky collapsed into (ease-out, per-particle speed)
  float bs = clamp((uBurst - 0.08) / 0.75 * (1.0 + aSeed * 0.6), 0.0, 1.0);
  float burstScale = 1.0 - pow(1.0 - bs, 3.0);
  if (seg == 0) a *= burstScale;
  float lag = aSeed * 0.42;
  float tt = smoothstep(0.0, 1.0, clamp((t - lag) / 0.58, 0.0, 1.0));
  vec3 p = mix(a, b, tt);

  // turbulent flight between eigenstates
  float flight = sin(PI * tt);
  if (flight > 0.002) {
    float amp = (0.18 * length(a - b) + 1.5) * uFlight;
    vec3 q = p * 0.05 + vec3(0.0, uTime * 0.12, aSeed * 0.2);
    p += vec3(snoise(q), snoise(q + 17.3), snoise(q + 41.7)) * flight * amp;
  }

  // "quantum fuzz": a tiny, never-still jitter
  float r = length(p);
  p += vec3(sin(uTime * 1.7 + aSeed * 61.0), sin(uTime * 1.3 + aSeed * 97.0), sin(uTime * 2.1 + aSeed * 13.0)) * (0.05 + r * 0.004);
  p *= uShrink;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float px = uPointPx * clamp(uCamDist / max(-mv.z, 1e-3), 0.4, 3.0);
  float alpha = 1.0;
  if (px < 1.25) {
    alpha = (px * px) / (1.5625);
    px = 1.25;
  }
  gl_PointSize = min(px, 7.0);

  // vacuum: hot during the burst, then sparse virtual pairs flicker in and out of existence
  float flicker = pow(0.5 + 0.5 * sin(uTime * (0.9 + 2.3 * aSeed) + aSeed * 83.0), 16.0);
  float vac = seg == 0 ? 1.0 - tt : 0.0;
  float settle = smoothstep(0.3, 0.75, uBurst);
  // bright only while in flight: an expanding hot shell rather than a uniform field of noise
  float hot = 0.04 + 9.0 * pow(1.0 - bs, 3.0) * step(0.001, bs);
  float glow = mix(1.0, mix(hot, flicker * 2.6, settle), vac);

  vColor = mix(stateColor(seg), stateColor(seg + 1), tt) * uIntensity * glow * (1.0 + uPulse);
  vAlpha = alpha;
}
