uniform vec3 uColor;
uniform float uIntensity;
uniform float uCore; // sharpness of the central peak
in vec2 vUv;
out vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * uCore);
  float halo = exp(-r2 * 6.0) * 0.35 + (1.0 - r2) * (1.0 - r2) * 0.06;
  float spikes = 0.0;
  fragColor = vec4(uColor * (core + halo + spikes) * uIntensity, 1.0);
}
