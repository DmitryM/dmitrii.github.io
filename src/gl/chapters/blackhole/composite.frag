// Full-resolution resolve of the (possibly reduced-resolution) ray-traced image:
//   colour  — Catmull–Rom bicubic upsampling of the disk emission
//   sky     — deferred lookup along the bilinearly-interpolated escaped ray direction,
//             so stars and the Milky Way stay sharp at any tracer resolution.
#include "../../shaders/common.glsl"
#include "../../shaders/blackbody.glsl"
#include "sky.glsl"

uniform sampler2D uColor;
uniform highp sampler2D uDir; // RGBA32F, nearest — filtered manually (no float-linear requirement)
uniform vec2 uTexSize; // allocated size of the tracer targets
uniform vec2 uValid; // region rendered this frame (dynamic resolution)
uniform float uWeight;
uniform float uSkyWeight;
in vec2 vUv;
out vec4 fragColor;

vec4 catmullRom(sampler2D tex, vec2 uv, vec2 size) {
  vec2 samplePos = uv * uValid;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / w12;
  // taps are clamped to the valid region so stale texels outside it are never read
  vec2 lo = vec2(0.5);
  vec2 hi = uValid - 0.5;
  vec2 texPos0 = clamp(texPos1 - 1.0, lo, hi) / size;
  vec2 texPos3 = clamp(texPos1 + 2.0, lo, hi) / size;
  vec2 texPos12 = clamp(texPos1 + offset12, lo, hi) / size;
  vec4 r = vec4(0.0);
  r += textureLod(tex, vec2(texPos0.x, texPos0.y), 0.0) * w0.x * w0.y;
  r += textureLod(tex, vec2(texPos12.x, texPos0.y), 0.0) * w12.x * w0.y;
  r += textureLod(tex, vec2(texPos3.x, texPos0.y), 0.0) * w3.x * w0.y;
  r += textureLod(tex, vec2(texPos0.x, texPos12.y), 0.0) * w0.x * w12.y;
  r += textureLod(tex, vec2(texPos12.x, texPos12.y), 0.0) * w12.x * w12.y;
  r += textureLod(tex, vec2(texPos3.x, texPos12.y), 0.0) * w3.x * w12.y;
  r += textureLod(tex, vec2(texPos0.x, texPos3.y), 0.0) * w0.x * w3.y;
  r += textureLod(tex, vec2(texPos12.x, texPos3.y), 0.0) * w12.x * w3.y;
  r += textureLod(tex, vec2(texPos3.x, texPos3.y), 0.0) * w3.x * w3.y;
  return r;
}

vec3 bilinearDir(vec2 uv) {
  vec2 p = uv * uValid - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  ivec2 mx = ivec2(uValid) - 1;
  vec3 a = texelFetch(uDir, clamp(i, ivec2(0), mx), 0).xyz;
  vec3 b = texelFetch(uDir, clamp(i + ivec2(1, 0), ivec2(0), mx), 0).xyz;
  vec3 c = texelFetch(uDir, clamp(i + ivec2(0, 1), ivec2(0), mx), 0).xyz;
  vec3 d = texelFetch(uDir, clamp(i + ivec2(1, 1), ivec2(0), mx), 0).xyz;
  return normalize(mix(mix(a, b, f.x), mix(c, d, f.x), f.y) + 1e-6);
}

void main() {
  vec4 c = catmullRom(uColor, vUv, uTexSize);
  vec2 suv = clamp(vUv * uValid, vec2(0.5), uValid - 0.5) / uTexSize;
  float vis = clamp(textureLod(uColor, suv, 0.0).a, 0.0, 1.0);
  vec3 dir = bilinearDir(vUv);
  float footprint = length(fwidth(dir));
  vec3 sky = skyColor(dir, footprint);
  vec3 col = max(c.rgb, vec3(0.0)) + sky * vis * uSkyWeight;
  fragColor = vec4(col * uWeight, 1.0);
}
