// Spherical wavefront of the emitted photon, seen in projection as an expanding ring.
uniform vec3 uColor;
uniform float uRadius; // 0…1 of the quad half-size
uniform float uWidth;
uniform float uIntensity;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float r = length(vUv);
  float ring = exp(-pow((r - uRadius) / uWidth, 2.0));
  float inner = smoothstep(0.0, uRadius, r) * step(r, uRadius) * 0.03;
  fragColor = vec4(uColor * (ring + inner) * uIntensity, 1.0);
}
