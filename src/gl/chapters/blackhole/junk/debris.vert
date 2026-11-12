// Debris of a tidal disruption: lit fragments that heat up into glowing gas as they spiral in.
#include "../../../shaders/common.glsl"
#include "../../../shaders/blackbody.glsl"
#include "../../../shaders/lensing.glsl"

in vec3 aVel;
in vec3 aColor;
in vec4 aData; // heat 0…1, alpha, size (r_s), emissive

uniform vec3 uCamPos;
uniform float uDiskTemp;
uniform float uKey;
uniform float uPointScale; // drawing-buffer pixels per r_s at unit depth

out vec3 vColor;
out float vAlpha;

void main() {
  vAlpha = aData.y;
  float b;
  float behind;
  vec3 lensed = lensPoint(position, b, behind);
  if (aData.y <= 0.0 || (behind > 0.5 && b < B_CRIT)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 mv = viewMatrix * vec4(lensed, 1.0);
  gl_Position = projectionMatrix * mv;

  float r = max(length(position), 1.0001);
  // g = ν_obs/ν_emit: relativistic Doppler (the gas moves at a good fraction of c) × gravitational
  vec3 n = normalize(uCamPos - position);
  float beta = min(length(aVel), 0.95);
  float cosT = beta > 1e-5 ? dot(aVel, n) / beta : 0.0;
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT) * sqrt(1.0 - 1.0 / r);

  float heat = aData.x;
  // shocked gas: hotter closer in (T ∝ r^-3/4); bolometric intensity scales as g⁴, so it reddens
  // and fades out at the horizon exactly as a distant observer would see
  float T = 8200.0 * pow(max(r, 1.2) / 3.0, -0.75) * (0.55 + 0.45 * heat);
  vec3 hot = blackbody(clamp(T * g, 1000.0, 40000.0)) * pow(g, 4.0) * (0.7 + 1.3 * heat);
  float keyI = uKey * clamp(pow(9.0 / max(r, 1.5), 2.0), 0.3, 6.0);
  vec3 lit = aColor * (blackbody(uDiskTemp) * keyI * 0.45 + 0.14 + aData.w) * pow(g, 3.0);
  vColor = mix(lit, hot, heat);

  gl_PointSize = clamp(aData.z * uPointScale / max(-mv.z, 0.1), 1.0, 28.0);
}
