// Gravitational lensing of points near the hole (primary image), after Beloborodov (2002):
//     1 − cos α = (1 − cos ψ)(1 − r_s/r),     b = r sin α / √(1 − r_s/r)
// ψ is the angle between the point's radius vector and the direction to the observer, b the
// impact parameter of the photon that reaches the observer. The point is moved within its plane
// of the sky to impact parameter b, so things behind the hole are lifted around its shadow.
// Units: r_s = 1, hole at the origin.

uniform vec3 uObsDir;   // unit vector from the hole toward the camera
uniform float uLensing; // 1 = GR, 0 = straight lines (observatory switch)

const float B_CRIT = 2.598076; // shadow radius, 3√3/2 r_s

vec3 lensPoint(vec3 p, out float b, out float behind) {
  float r = max(length(p), 1.001);
  float along = dot(p, uObsDir);
  vec3 perp = p - uObsDir * along;
  float d = length(perp);
  float k = 1.0 - 1.0 / r;
  float cosA = 1.0 - (1.0 - along / r) * k;
  float bl = r * sqrt(max(1.0 - cosA * cosA, 0.0)) * inversesqrt(k);
  b = mix(d, bl, uLensing);
  behind = step(along, 0.0);
  return uObsDir * along + perp * (d > 1e-5 ? b / d : 1.0);
}
