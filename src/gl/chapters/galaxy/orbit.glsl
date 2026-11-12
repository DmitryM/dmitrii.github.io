// Two kinematic populations (see Galaxy.ts):
//   kind 0 — old disk & bulge stars: circular orbits on a flat rotation curve (differential)
//   kind 1 — arm population (young O/B stars, H II regions, dust): rigid with the spiral
//            density-wave pattern; they are born in the arms and die before drifting out.
uniform float uTime;
uniform float uCoreR; // solid-body core radius
uniform float uVrot; // flat rotation speed [units / s]
uniform float uPattern; // pattern speed of the arms [rad / s]

vec3 galaxyPos(float a, float phase, float kind, float y) {
  float omega = kind > 0.5 ? uPattern : uVrot / max(a, uCoreR);
  float t = phase + omega * uTime;
  return vec3(a * cos(t), y, a * sin(t));
}
