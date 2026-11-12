// Designer-toy shading lit by the accretion disk, relativistic colour shifts, and the burning
// dissolve front of a tidal disruption.
#include "../../../shaders/common.glsl"
#include "../../../shaders/blackbody.glsl"

uniform sampler2D uAtlas;
uniform vec3 uCamPos;
uniform float uDiskTemp;
uniform float uKey;       // disk brightness (rises with the flare)
uniform vec3 uShift;      // colour of a 6500 K spectrum after the Doppler + gravitational shift
uniform float uBright;    // brightness change, g³
uniform float uHeat;      // tidal heating, 0…1
uniform float uDissolve;  // position of the dissolve front in threshold units
uniform float uBurning;   // 1 while the body is being torn apart
uniform vec3 uPeelDir;    // body-local direction toward the hole when the disruption began
uniform float uRadius;    // BODY_RADIUS
uniform float uTime;
uniform float uFade;

in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
in vec3 vColor;
in vec4 vMat;
in vec3 vDecal;
in float vB;
in float vBehind;
out vec4 fragColor;

// keep in sync with wobble() / dissolveThreshold() in models.ts
float wobble(vec3 p) {
  return (sin(p.x * 4.1 + sin(p.y * 3.3)) + sin(p.y * 4.7 + sin(p.z * 3.9)) + sin(p.z * 4.3 + sin(p.x * 3.1))) / 6.0 + 0.5;
}
float threshold(vec3 p, float peel) {
  float g = 0.5 - 0.5 * dot(p, uPeelDir) / uRadius;
  return 0.62 * g + 0.38 * wobble(p) - 0.45 * peel;
}

void main() {
  // hidden by the shadow
  if (vBehind > 0.5 && vB < 2.598076) discard; // b_c = 3√3/2
  float kind = vMat.w;
  bool glass = abs(kind - 4.0) < 0.5;
  if (glass && !gl_FrontFacing) discard;
  float front = threshold(vLocal, vMat.z) - uDissolve;
  if (front < 0.0) discard;

  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorld);
  float r = length(vWorld);
  vec3 toHole = -vWorld / max(r, 1e-3);
  // key light: the inner disk, a little below/above the object depending on its side of the plane
  vec3 L = normalize(toHole + vec3(0.0, vWorld.y >= 0.0 ? -0.25 : 0.25, 0.0));
  float keyI = uKey * clamp(pow(9.0 / max(r, 1.5), 2.0), 0.3, 6.0);
  vec3 disk = blackbody(uDiskTemp);

  vec3 albedo = vColor;
  if (vDecal.z > 0.5) {
    vec4 d = texture(uAtlas, vDecal.xy);
    albedo = mix(albedo, d.rgb, d.a);
  }
  float gloss = vMat.y;
  float ndl = dot(N, L);
  float wrap = max((ndl + 0.4) / 1.4, 0.0);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

  vec3 sky = vec3(0.10, 0.12, 0.19);
  // kept in the mid-tones so the colours stay saturated through the AgX tone mapping
  vec3 col = albedo * disk * keyI * wrap * 0.5;
  // light bounced off the disk plane
  col += albedo * disk * keyI * 0.15 * max(vWorld.y >= 0.0 ? -N.y : N.y, 0.0);
  // starlight, and a soft front fill so the toy reads against the dark sky
  col += albedo * (sky * (0.55 + 0.35 * N.y) + 0.09 * ndv);

  // glossy plastic: a GGX highlight of the disk plus a Fresnel reflection of the sky and the disk
  float rough = mix(0.7, 0.12, gloss);
  float a2 = pow(rough, 4.0);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  col += disk * keyI * D * max(ndl, 0.0) * mix(0.04, 1.0, fres) * 0.35 * gloss;
  vec3 R = reflect(-V, N);
  vec3 env = disk * keyI * pow(max(dot(R, toHole), 0.0), mix(2.0, 18.0, gloss)) * 0.7 + sky * 0.4;
  col += env * fres * (0.15 + 0.6 * gloss);

  // AgX tone mapping (Composer.ts) desaturates mid-tones; pre-compensate so toys keep their colour
  col = max(mix(vec3(lum709(col)), col, 1.45), 0.0);

  // glowing parts: screens, LEDs, flames
  float emit = vMat.x;
  if (abs(kind - 3.0) < 0.5) emit *= step(0.42, fract(uTime * 1.4 + vLocal.x * 0.2));
  if (abs(kind - 5.0) < 0.5) emit *= 0.92 + 0.08 * sin(uTime * 61.0) - 0.5 * uHeat * step(0.6, fract(uTime * 9.0));
  if (abs(kind - 2.0) < 0.5) emit *= 0.8 + 0.3 * sin(uTime * 25.0 + vLocal.y * 9.0) * sin(uTime * 7.0 + vLocal.x * 5.0);
  col += albedo * emit;

  // what a distant observer sees: Doppler + gravitational shift of colour and brightness
  col *= uShift * uBright;

  // tidal heating on the side facing the hole, then the burning front as it comes apart
  float facing = 0.5 + 0.5 * dot(N, toHole);
  col += blackbody(mix(1800.0, 5200.0, uHeat)) * uHeat * uHeat * uHeat * facing * 1.3;
  float band = (1.0 - smoothstep(0.0, 0.08, front)) * uBurning;
  col += blackbody(mix(3000.0, 12000.0, band)) * band * band * 7.0;

  float alpha = 1.0;
  if (glass) {
    alpha = clamp(0.1 + 0.85 * fres, 0.0, 1.0);
    col = env * fres * 1.6 + disk * keyI * D * 0.4 + albedo * 0.02;
    col *= uShift * uBright;
  }
  fragColor = vec4(col * alpha, alpha) * uFade;
}
