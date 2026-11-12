// Sky: baked diffuse Milky Way (cube map) + analytic point stars on an equi-angular cube grid.
uniform samplerCube uSky;
uniform float uStarExposure;
uniform float uSkyExposure;

vec3 starLayer(vec3 d, float footprint, float cells, float density, float sizeK, float seed) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) {
    face = d.x > 0.0 ? 0.0 : 1.0;
    uv = d.zy / a.x;
  } else if (a.y >= a.z) {
    face = d.y > 0.0 ? 2.0 : 3.0;
    uv = d.xz / a.y;
  } else {
    face = d.z > 0.0 ? 4.0 : 5.0;
    uv = d.xy / a.z;
  }
  uv = atan(uv) * (4.0 / PI); // equi-angular cube map → uniform cell sizes
  vec2 g = (uv * 0.5 + 0.5) * cells;
  vec2 cell = floor(g);
  vec2 f = g - cell;
  vec4 h = hash42(cell + vec2(face * 1237.0 + seed, seed * 3.1));
  if (h.x > density) return vec3(0.0);

  vec2 c = 0.22 + 0.56 * h.yz;
  float cellAngle = (0.5 * PI) / cells;
  float dist = length(f - c) * cellAngle;
  float starSigma = sizeK * cellAngle;
  float sigma = max(starSigma, footprint * 0.42);
  float energy = (starSigma * starSigma) / (sigma * sigma);
  // fade stars whose footprint exceeds the cell (strong demagnification) instead of aliasing
  float visible = 1.0 - smoothstep(0.35, 0.8, footprint / cellAngle);

  vec4 h2 = hash42(cell.yx * 1.31 + vec2(seed * 7.0, face));
  float bright = 0.035 * pow(h.w, 3.0) + 6.0 * pow(h.w, 22.0);
  float T = 3100.0 + 8200.0 * pow(h2.x, 1.7) + step(0.93, h2.y) * 14000.0 * h2.z;
  float psf = exp(-0.5 * (dist * dist) / (sigma * sigma));
  return blackbody(T) * bright * psf * energy * visible;
}

vec3 skyColor(vec3 d, float footprint) {
  float lod = log2(max(footprint / ((0.5 * PI) / 512.0), 1.0));
  vec3 milky = textureLod(uSky, d, lod).rgb * uSkyExposure;
  vec3 stars = starLayer(d, footprint, 640.0, 0.06, 0.12, 0.0) + starLayer(d, footprint, 170.0, 0.16, 0.05, 17.0) * 1.6;
  return milky + stars * uStarExposure;
}

