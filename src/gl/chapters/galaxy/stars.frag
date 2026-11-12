in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = (exp(-d2 * 4.5) + 0.12 * exp(-d2 * 1.2)) * vAlpha;
  fragColor = vec4(vColor, min(a, 1.0));
}
