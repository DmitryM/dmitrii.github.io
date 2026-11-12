// Dust absorbs: blended as dst · (1 − α).
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 2.2) * vAlpha * vColor.r;
  fragColor = vec4(0.0, 0.0, 0.0, min(a, 1.0));
}
