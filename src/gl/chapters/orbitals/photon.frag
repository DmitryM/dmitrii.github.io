uniform vec3 uColor;
uniform float uIntensity;
in float vEnv;
in float vAcross;
out vec4 fragColor;
float saturate1(float x) { return clamp(x, 0.0, 1.0); }

void main() {
  float core = exp(-vAcross * vAcross * 6.0);
  fragColor = vec4(uColor * uIntensity, saturate1(vEnv * core));
}
