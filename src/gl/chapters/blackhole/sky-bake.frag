// Baked once into a cube map: diffuse Milky Way band, dust lanes, faint emission nebulae.
#include "../../shaders/common.glsl"
#include "../../shaders/noise.glsl"

in vec3 vDir;
out vec4 fragColor;

void main() {
  vec3 d = normalize(vDir);

  // galactic frame, tilted against the accretion disk for a diagonal band
  vec3 gN = normalize(vec3(0.32, 0.86, -0.4));
  vec3 gC = normalize(cross(gN, vec3(0.0, 0.0, 1.0)));
  vec3 gE = cross(gN, gC);
  float lat = asin(clamp(dot(d, gN), -1.0, 1.0));
  float lon = atan(dot(d, gE), dot(d, gC));

  float bulge = exp(-pow(lon / 0.75, 2.0)) * exp(-pow(lat / 0.22, 2.0));
  float width = 0.13 + 0.06 * fbm(d * 2.0 + 4.0, 3);
  float band = exp(-pow(lat / width, 2.0));

  float clouds = 0.5 + 0.5 * fbm(d * 3.2, 6);
  float grain = 0.5 + 0.5 * fbm(d * 22.0 + 7.0, 4);
  float lanes = smoothstep(0.05, 0.6, fbm(d * 6.5 + vec3(2.0, 9.0, 1.0), 6)) * exp(-pow(lat / (width * 0.42), 2.0));

  vec3 warm = vec3(1.0, 0.86, 0.68);
  vec3 cool = vec3(0.72, 0.8, 1.0);
  vec3 col = mix(cool, warm, saturate(bulge * 1.6 + 0.25)) * band * (0.35 + 0.9 * clouds * clouds) * (0.55 + 0.6 * grain);
  col += warm * bulge * 1.6 * (0.6 + 0.4 * clouds);
  col *= 1.0 - 0.88 * lanes;

  // H II (Hα-pink) and [O III] (teal) emission patches hugging the plane
  float ha = pow(saturate(0.5 + 0.5 * fbm(d * 4.5 + 11.0, 5)), 5.0) * band;
  float o3 = pow(saturate(0.5 + 0.5 * fbm(d * 3.0 + 27.0, 5)), 7.0) * (0.3 + band);
  col += vec3(1.0, 0.26, 0.38) * ha * 0.9;
  col += vec3(0.16, 0.62, 0.72) * o3 * 0.35;

  // faint all-sky glow so the blacks are not dead
  col += vec3(0.55, 0.6, 0.8) * 0.012 * (0.6 + 0.4 * clouds);

  fragColor = vec4(col * 0.05, 1.0);
}
