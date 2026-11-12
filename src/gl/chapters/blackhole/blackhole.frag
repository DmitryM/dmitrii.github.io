// ─────────────────────────────────────────────────────────────────────────────────────────────
//  Schwarzschild black hole — per-pixel null-geodesic ray tracer.
//  Units: r_s = 2GM/c² = 1.  Disk in the y = 0 plane, orbiting towards +φ = atan(z, x).
//
//  Photon equation (exact for Schwarzschild, Cartesian "pseudo-Newtonian" form):
//      d²x/dλ² = −(3/2) h² x / r⁵ ,  h = |x × v|
//  Integrated with RK4 and an adaptive step (mirrors src/physics/schwarzschild.ts).
// ─────────────────────────────────────────────────────────────────────────────────────────────
#include "../../shaders/common.glsl"
#include "../../shaders/blackbody.glsl"

#ifndef MAX_STEPS
#define MAX_STEPS 200
#endif
#ifndef DISK_SAMPLES
#define DISK_SAMPLES 1
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanHalfFov;
uniform vec2 uLensShift; // NDC offset of the optical axis

uniform sampler2D uDiskNoise;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskTemp; // peak emitted temperature [K]
uniform float uDiskSpeed;
uniform float uLensing; // 1 = GR, 0 = straight lines
uniform float uDoppler; // 1 = relativistic beaming on
uniform float uRedshift; // 1 = gravitational redshift on
uniform float uExposure;

in vec2 vUv;
layout(location = 0) out vec4 outColor; // rgb: disk emission, a: sky visibility (transmittance, 0 if captured)
layout(location = 1) out vec4 outDir; // xyz: escaped ray direction

// max of x⁻³(1 − x^−½), reached at x = 49/36
const float F_MAX = 0.0566;
const float FLOW_PERIOD = 5.0;

float stepSize(float r) {
  float near = abs(r - 1.5);
  return clamp(0.07 * r * clamp(0.5 + near, 0.5, 1.0), 0.005, 3.0);
}

vec3 accel(vec3 p, float h2) {
  float r2 = dot(p, p);
  return (-1.5 * h2 / (r2 * r2 * sqrt(r2))) * p;
}

// ── accretion disk ───────────────────────────────────────────────────────────────────────────

const float DISK_H = 0.035; // scale height / r  (geometrically thin, optically thick-ish)

// Variance-preserving blend of two flow-map phases of the baked turbulence: the pattern is
// sheared by Keplerian differential rotation but periodically re-seeded so it never winds up.
vec3 diskNoise(float phi, float rho, float r, vec2 gx, vec2 gy, float yOff) {
  float omega = 0.70710678 * pow(r, -1.5); // Ω = √(M/r³), M = ½ (r_s = 1)
  float T = uTime * uDiskSpeed;
  float p1 = fract(T / FLOW_PERIOD);
  float p2 = fract(T / FLOW_PERIOD + 0.5);
  float w1 = 1.0 - abs(2.0 * p1 - 1.0);
  float w2 = 1.0 - w1;
  float u = phi / TAU;
  vec2 uv1 = vec2(u - omega * p1 * FLOW_PERIOD / TAU + yOff, rho);
  vec2 uv2 = vec2(u - omega * p2 * FLOW_PERIOD / TAU + 0.371 - yOff, rho + 0.013);
  vec3 a = textureGrad(uDiskNoise, uv1, gx, gy).rgb;
  vec3 b = textureGrad(uDiskNoise, uv2, gx, gy).rgb;
  float k = inversesqrt(w1 * w1 + w2 * w2);
  return clamp(((a - 0.5) * w1 + (b - 0.5) * w2) * k + 0.5, 0.0, 1.0);
}

// Source radiance (rgb) and density (a) of the disk gas at p, seen along ray direction d.
vec4 diskSample(vec3 p, vec3 d, float footprint) {
  float r = length(p.xz);
  if (r < uDiskInner * 0.9 || r > uDiskOuter) return vec4(0.0);

  float phi = atan(p.z, p.x);
  float lr0 = log(uDiskInner * 0.9);
  float rho = (log(r) - lr0) / (log(uDiskOuter) - lr0);

  // Analytic texture gradients (no implicit derivatives inside the march loop). The pixel
  // footprint is stretched by 1/|d·ŷ| along the ray's projection onto the disk plane; feeding
  // both axes to textureGrad lets the GPU filter anisotropically instead of sparkling at grazing angles.
  vec2 radial = p.xz / r;
  vec2 tang = vec2(-radial.y, radial.x);
  vec2 along = length(d.xz) > 1e-4 ? normalize(d.xz) : tang;
  vec2 across = vec2(-along.y, along.x);
  vec2 fa = along * (footprint / max(abs(d.y), 0.025));
  vec2 fb = across * footprint;
  float L = log(uDiskOuter) - lr0;
  vec2 gx = vec2(dot(fa, tang) / (TAU * r), dot(fa, radial) / (r * L));
  vec2 gy = vec2(dot(fb, tang) / (TAU * r), dot(fb, radial) / (r * L));

  float H = DISK_H * r;
  float vert = exp(-(p.y * p.y) / (H * H));
  vec3 nz = diskNoise(phi, rho, r, gx, gy, p.y / H * 0.004);
  float streaks = nz.r * 0.72 + nz.g * 0.28;
  float clumps = smoothstep(0.2, 0.85, nz.b);
  // a rigidly rotating two-armed density wave (pattern speed ≠ gas speed)
  float wave = 0.5 + 0.5 * cos(2.0 * phi - 5.5 * log(r) + uTime * 0.12);
  float n = streaks * (0.45 + 0.75 * clumps) * (0.78 + 0.32 * wave);

  // Novikov–Thorne-like flux profile with zero-torque inner edge
  float x = r / uDiskInner;
  float flux = max(pow(x, -3.0) * (1.0 - inversesqrt(max(x, 1.0))), 0.0) / F_MAX;
  float Temit = uDiskTemp * pow(max(flux, 1e-4), 0.25) * (0.92 + 0.16 * n);

  // relativistic frequency shift g = ν_obs / ν_emit (Doppler × gravitational)
  vec3 vel = normalize(vec3(-p.z, 0.0, p.x));
  float beta = inversesqrt(2.0 * max(r - 1.0, 0.6));
  float gamma = inversesqrt(1.0 - beta * beta);
  float cosT = dot(vel, -d);
  float delta = 1.0 / (gamma * (1.0 - beta * cosT));
  float g = mix(1.0, delta, uDoppler) * mix(1.0, sqrt(max(1.0 - 1.0 / r, 0.0)), uRedshift);

  float Tobs = Temit * g;
  // Bolometric I ∝ g⁴ T⁴; the flux term is softened so the outer disk stays visible on a display.
  float I = pow(g, 4.0) * pow(flux, 0.6);

  float edgeIn = smoothstep(uDiskInner * 0.9, uDiskInner * 1.2, r);
  float edgeOut = 1.0 - smoothstep(uDiskOuter * 0.5, uDiskOuter, r);
  float dens = edgeIn * edgeOut * vert * (0.1 + 1.6 * n * n);

  vec3 source = blackbody(Tobs) * I * (0.1 + 2.1 * n * n) * 0.85;
  return vec4(source, dens);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

struct Trace {
  vec3 col;
  float vis; // sky visibility: transmittance × (not captured)
  vec3 dir; // escaped direction
};

vec3 primaryRay(vec2 ndc) {
  float aspect = uResolution.x / uResolution.y;
  return normalize(uCamFwd + (ndc.x * aspect * uTanHalfFov) * uCamRight + (ndc.y * uTanHalfFov) * uCamUp);
}

Trace trace(vec3 dir, float pixelAngle) {
  vec3 pos = uCamPos;
  // The camera is a static observer: convert its locally measured direction to the coordinate
  // direction the integrator uses (gravitational aberration, tan ψ = tan α / √(1 − r_s/r)).
  // Far away this is a ~2% effect; at the horizon it squeezes the whole sky into a point.
  {
    float r0 = length(pos);
    vec3 rh = pos / r0;
    float dr = dot(dir, rh);
    float k = mix(1.0, sqrt(max(1.0 - 1.0 / r0, 1e-7)), uLensing);
    dir = normalize(rh * (dr * k) + (dir - rh * dr));
  }
  vec3 hv = cross(pos, dir);
  float h2 = dot(hv, hv) * uLensing;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float captured = 0.0;
  float pathLen = 0.0;
  float rCam = length(uCamPos);
  float rEscape = max(42.0, rCam * 1.5);
  float crossings = 0.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(pos);
    if (r < 1.0) {
      captured = 1.0;
      break;
    }
    if (r > rEscape && dot(pos, dir) > 0.0) break;

    float dt = stepSize(r);
    vec3 p0 = pos;
    vec3 v0 = dir;

    vec3 k1x = v0;
    vec3 k1v = accel(p0, h2);
    vec3 k2x = v0 + 0.5 * dt * k1v;
    vec3 k2v = accel(p0 + 0.5 * dt * k1x, h2);
    vec3 k3x = v0 + 0.5 * dt * k2v;
    vec3 k3v = accel(p0 + 0.5 * dt * k2x, h2);
    vec3 k4x = v0 + dt * k3v;
    vec3 k4v = accel(p0 + dt * k3x, h2);
    pos = p0 + (dt / 6.0) * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
    dir = v0 + (dt / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    pathLen += dt;

    // Thin, optically thick sheet: one sample at each mid-plane crossing → crisp primary,
    // secondary, … images. Each extra image order is ~e^π ≈ 23× compressed radially, so the
    // texture LOD is biased per order to keep the photon ring from aliasing into dashes.
    if (p0.y * pos.y <= 0.0 && p0.y != pos.y) {
      float t = p0.y / (p0.y - pos.y);
      vec3 pc = mix(p0, pos, t);
      vec4 e = diskSample(vec3(pc.x, 0.0, pc.z), normalize(mix(v0, dir, t)), pathLen * pixelAngle * (1.0 + 22.0 * crossings));
      float a = clamp(e.a * 1.15, 0.0, 1.0);
      col += trans * e.rgb * a;
      trans *= 1.0 - a;
      crossings += 1.0;
    }
#if DISK_SAMPLES > 1
    else {
      // grazing halo: rays skimming the sheet pick up glow from its vertical atmosphere,
      // which also anti-aliases the razor-thin edge in front of the shadow
      vec3 pc = abs(p0.y) < abs(pos.y) ? p0 : pos;
      float rc = length(pc.xz);
      float H = DISK_H * rc;
      float v = exp(-(pc.y * pc.y) / (H * H * 9.0));
      if (v > 0.02 && rc > uDiskInner * 0.85 && rc < uDiskOuter) {
        vec4 e = diskSample(vec3(pc.x, 0.0, pc.z), normalize(dir), pathLen * pixelAngle * (1.0 + 22.0 * crossings) * 4.0);
        float a = clamp(e.a * v * 0.22 * min(length(pos - p0) / (6.0 * H), 1.0), 0.0, 0.6);
        col += trans * e.rgb * a;
        trans *= 1.0 - a * 0.6;
      }
    }
#endif
    if (trans < 0.004) break;
  }

  // Unresolved: a ray that ran out of steps close to the hole is trapped near the photon sphere.
  if (captured < 0.5 && length(pos) < 3.0) captured = 1.0;
  return Trace(col, trans * (1.0 - captured), normalize(dir));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0 - uLensShift;
  float pixelAngle = 2.0 * uTanHalfFov / uResolution.y;
  vec3 dir = primaryRay(ndc);
  Trace t = trace(dir, pixelAngle);

  // The photon ring (rays with impact parameter b ≈ b_c = 3√3/2) is thinner than a pixel and
  // aliases into dashes. Supersample just that annulus with a 4-ray rotated grid (~2% of pixels).
  float b = length(cross(uCamPos, dir));
  if (abs(b - 2.598) < 0.32 && uLensing > 0.5) {
    vec2 px = 2.0 / uResolution;
    vec3 col = t.col;
    float vis = t.vis;
    vec3 d = t.dir;
    // standard 8× MSAA pattern (in 1/16 pixel); the outer band uses the first three taps
    const vec2 MS8[7] = vec2[7](vec2(-1.0, 3.0), vec2(5.0, 1.0), vec2(-3.0, -5.0), vec2(-5.0, 5.0), vec2(-7.0, -1.0), vec2(3.0, 7.0), vec2(7.0, -7.0));
    int taps = abs(b - 2.598) < 0.08 ? 7 : 3;
    for (int k = 0; k < 7; k++) {
      if (k >= taps) break;
      Trace s = trace(primaryRay(ndc + MS8[k] / 16.0 * px), pixelAngle);
      col += s.col;
      vis += s.vis;
      d += s.dir * s.vis;
    }
    float inv = 1.0 / float(taps + 1);
    t.col = col * inv;
    t.vis = vis * inv;
    t.dir = normalize(d + 1e-5);
  }

  // The sky is evaluated later at full resolution from the escaped direction (deferred lookup),
  // which keeps stars pin-sharp even when the tracer runs at reduced resolution.
  outColor = vec4(t.col * uExposure, t.vis);
  outDir = vec4(t.dir, 1.0);
}
