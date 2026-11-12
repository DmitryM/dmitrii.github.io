in vec3 vColor;
in float vAlpha;
out vec4 fragColor;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 3.5) * vAlpha;
  // additive; alpha stays 0 so the composite simply adds the light
  fragColor = vec4(vColor * a, 0.0);
}
