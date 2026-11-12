// Baked once: tileable-in-φ turbulence for the accretion disk, stretched along the orbit.
// x = φ / 2π (periodic), y = normalised log-radius.
#include "../../shaders/common.glsl"
#include "../../shaders/noise.glsl"

in vec2 vUv;
out vec4 fragColor;

void main() {
  float a = vUv.x * TAU;
  vec2 ring = vec2(cos(a), sin(a));
  float y = vUv.y;

  // streaks: low frequency along φ, high along r
  vec3 p = vec3(ring * 1.6, y * 22.0);
  vec3 q = vec3(ring * 3.0, y * 9.0) + 3.7;
  vec3 warp = vec3(fbm(q, 4), fbm(q + 5.2, 4), fbm(q + 9.1, 4));
  float streak = ridged(p + warp * 0.55, 6);
  float clumps = 0.5 + 0.5 * fbm(vec3(ring * 5.0, y * 14.0) + warp, 5);
  float fine = ridged(vec3(ring * 9.0, y * 60.0) + warp * 0.3, 4);

  float r = saturate(streak * 0.75 + clumps * 0.45 - 0.12);
  float g = saturate(fine * 0.8 + clumps * 0.2);
  fragColor = vec4(r, g, clumps, 1.0);
}
