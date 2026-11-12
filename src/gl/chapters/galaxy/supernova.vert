in vec3 aColor;
in float aLum;
uniform float uSize;
out vec3 vColor;
out float vLum;
void main() {
  vColor = aColor;
  vLum = aLum;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aLum > 0.0 ? uSize * (0.55 + 0.45 * min(aLum, 1.0)) : 0.0;
}
