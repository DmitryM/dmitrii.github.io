#include "orbit.glsl"

in float aOrbit;
in float aPhase;
in float aKind;
in vec3 aParams; // height above the plane, world size, brightness
in vec3 aColor;

uniform float uViewportH;
uniform float uMaxPx;
uniform float uIntensity;

out vec3 vColor;
out float vAlpha;

void main() {
  vec3 p = galaxyPos(aOrbit, aPhase, aKind, aParams.x);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aParams.y * projectionMatrix[1][1] * uViewportH * 0.5 / max(-mv.z, 1e-4);
  float alpha = 1.0;
  float bright = 1.0;
  if (px < 1.3) {
    alpha = px * px / 1.69;
    px = 1.3;
  } else if (px > uMaxPx) {
    // keep stars point-like when the camera is very close; conserve some energy as glow
    bright = min(1.0 + log2(px / uMaxPx) * 0.35, 3.0);
    px = uMaxPx;
  }
  gl_PointSize = px;
  vColor = aColor * aParams.z * uIntensity * bright;
  vAlpha = alpha;
}
