// Thrown objects: rigid tumbling, tidal stretching, lensing.
#include "../../../shaders/lensing.glsl"

in vec3 color;
in vec4 aMat;   // emissive, gloss, peel bias, kind
in vec3 aDecal; // atlas uv, on

uniform mat3 uRot;      // orientation
uniform vec3 uCenter;   // centre of mass (r_s)
uniform vec3 uAxis;     // radial unit vector, the stretch axis
uniform float uStretch; // tidal elongation along uAxis (volume preserving)
uniform float uTime;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
out vec3 vColor;
out vec4 vMat;
out vec3 vDecal;
out float vB;
out float vBehind;

void main() {
  vec3 p = position;
  float kind = aMat.w;
  // little lives of their own: scurrying legs, licking flames
  if (abs(kind - 1.0) < 0.5) p.y += sin(uTime * 22.0 + position.x * 6.0 + sign(position.z) * 1.7) * 0.06;
  if (abs(kind - 2.0) < 0.5) {
    p.x += sin(uTime * 13.0 + position.y * 7.0 + position.z * 3.0) * 0.035;
    p.z += sin(uTime * 17.0 + position.y * 6.0 + position.x * 5.0) * 0.035;
  }
  vLocal = position;

  vec3 o = uRot * p;
  vec3 n = uRot * normal;
  // spaghettification: stretched along the radial direction, squeezed across it
  float sq = inversesqrt(uStretch);
  float along = dot(o, uAxis);
  o = uAxis * (along * uStretch) + (o - uAxis * along) * sq;
  float na = dot(n, uAxis);
  n = uAxis * (na / uStretch) + (n - uAxis * na) / sq;

  vec3 world = uCenter + o;
  vWorld = world;
  vNormal = normalize(n);
  float b;
  float behind;
  vec3 lensed = lensPoint(world, b, behind);
  vB = b;
  vBehind = behind;
  vColor = color;
  vMat = aMat;
  vDecal = aDecal;
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
