// Blackbody chroma LUT (unit luminance, linear sRGB), log-spaced in temperature.
// Built on the CPU from CIE 1931 colour matching functions — see src/physics/blackbody.ts.
uniform sampler2D uBlackbody;
const float BB_TMIN = 1000.0;
const float BB_TMAX = 40000.0;
const float BB_SIZE = 256.0;

vec3 blackbody(float T) {
  float u = clamp(log(T / BB_TMIN) / log(BB_TMAX / BB_TMIN), 0.0, 1.0);
  return textureLod(uBlackbody, vec2((u * (BB_SIZE - 1.0) + 0.5) / BB_SIZE, 0.5), 0.0).rgb;
}
