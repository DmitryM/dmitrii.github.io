// Unresolved starlight of the galaxy as a smooth surface-brightness map in the disk plane.
// Same model as the star particles (Galaxy.ts): exponential disk + bulge, two trailing log-spiral
// arms with the same wobble, rotating rigidly at the pattern speed, and a dust lane on their
// concave side. Low-frequency noise keeps it from looking airbrushed.
#define PI 3.14159265359

uniform float uTime;
uniform float uPattern;
uniform float uArmK;
uniform float uArmA0;
uniform float uIntensity;
in vec2 vXZ;
out vec4 fragColor;

float armAngle(float a, float arm) {
  float wobble = 0.24 * sin(a * 0.82 + arm * 2.1) + 0.11 * sin(a * 2.3 + arm * 0.7 + 1.3);
  return arm * PI - uArmK * log(a / uArmA0) + wobble;
}
float wrapPi(float x) { return x - 2.0 * PI * floor((x + PI) / (2.0 * PI)); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 7.1) + 0.15 * vnoise(p * 4.37 + 3.3); }

void main() {
  float r = length(vXZ);
  if (r > 30.0) discard;
  float phi = atan(vXZ.y, vXZ.x) - uPattern * uTime; // co-rotating with the arm pattern
  vec2 q = r * vec2(cos(phi), sin(phi));

  float disk = exp(-r / 3.6) * smoothstep(24.0, 10.0, r);
  float bulge = exp(-r * r / 2.2);

  float arms = 0.0;
  float lane = 0.0;
  if (r > uArmA0 * 0.7) {
    float w = 0.42 + 0.07 * r;
    for (int k = 0; k < 2; k++) {
      float d = wrapPi(phi - armAngle(r, float(k))) * r; // arc distance to the arm ridge
      arms += exp(-pow(d / w, 2.0)) + 0.35 * exp(-pow(d / (2.6 * w), 2.0));
      float dl = wrapPi(phi - armAngle(r, float(k)) - 0.24) * r;
      lane += exp(-pow(dl / (0.55 * w), 2.0));
    }
    arms *= smoothstep(uArmA0 * 0.7, uArmA0 * 1.6, r) * exp(-r / 9.0) * smoothstep(21.0, 14.0, r);
  }
  float mottle = fbm(q * 0.55);
  float clumps = fbm(q * 1.4 + 11.0);
  arms *= 0.55 + 0.9 * clumps;
  float dust = 1.0 - 0.45 * lane * (0.3 + 0.9 * mottle) * smoothstep(2.0, 4.0, r);

  vec3 warm = vec3(1.0, 0.8, 0.6);
  vec3 young = vec3(0.72, 0.82, 1.0);
  vec3 core = vec3(1.0, 0.82, 0.62);
  vec3 col = (warm * disk * (0.6 + 0.8 * mottle) * 0.8 + young * arms * 0.5) * dust + core * bulge * 2.0;
  fragColor = vec4(col * uIntensity, 1.0);
}
