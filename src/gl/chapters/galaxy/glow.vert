// Camera-facing billboard (core glow, hero star). position.xy ∈ [−0.5, 0.5].
uniform float uScale;
out vec2 vUv;
void main() {
  vUv = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uScale;
  gl_Position = projectionMatrix * mv;
}
