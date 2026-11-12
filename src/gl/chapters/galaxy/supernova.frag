// A supernova: blinding core, wide soft halo, faint diffraction cross (telescope-style).
in vec3 vColor;
in float vLum;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 90.0) * 6.0;
  float halo = exp(-d2 * 9.0) * 0.8 + (1.0 - d2) * (1.0 - d2) * 0.08;
  float spikes = (exp(-abs(c.x) * 70.0) + exp(-abs(c.y) * 70.0)) * (1.0 - sqrt(d2)) * 0.35;
  fragColor = vec4(vColor * (core + halo + spikes) * vLum, 1.0);
}
