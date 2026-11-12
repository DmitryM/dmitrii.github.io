// A photon as a travelling wave packet: Re[ e^{i(kx − ωt)} ] · Gaussian envelope.
uniform float uLength;
uniform float uAmp;
uniform float uThick;
uniform float uCenter; // packet centre along the ribbon, 0…1
uniform float uWidth; // envelope width (fraction of length)
uniform float uWavelength; // visual wavelength (fraction of length)
uniform float uTime;
out float vEnv;
out float vAcross;

void main() {
  float x = position.x + 0.5;
  float env = exp(-pow((x - uCenter) / uWidth, 2.0));
  float phase = 6.28318530718 * (x / uWavelength) - uTime * 9.0;
  float y = sin(phase) * env * uAmp + position.y * uThick;
  vEnv = env;
  vAcross = position.y * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x * uLength, y, 0.0, 1.0);
}
