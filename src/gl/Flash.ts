import { AdditiveBlending, Vector2, type WebGLRenderer } from 'three';
import type { Chapter, FrameInfo, Readout } from './Chapter';
import { FullscreenPass } from './util';

/**
 * The hand-over from the black hole to the quantum vacuum: the last point of sky flares into a
 * bright, quickly widening burst (the bloom pass turns it into a white-out at its peak).
 */
export class Flash implements Chapter {
  readonly name = 'flash';
  weight = 0;
  /** burst progress: drives the size of the expanding shock */
  progress = 0;
  private readonly pass = new FullscreenPass({
    blending: AdditiveBlending,
    uniforms: { uAmount: { value: 0 }, uProgress: { value: 0 }, uAspect: { value: 1 }, uCenter: { value: new Vector2(0.5, 0.5) } },
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      uniform float uProgress;
      uniform float uAspect;
      uniform vec2 uCenter;
      in vec2 vUv;
      out vec4 fragColor;
      void main() {
        vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
        float r2 = dot(d, d);
        float a = uAmount;
        // a core that keeps widening with the burst while the flash itself fades,
        // a thin shock ring running ahead of it, and a soft veil at the peak
        float grow = smoothstep(0.0, 0.45, uProgress);
        float sigma = mix(0.002, 0.16, grow);
        float core = exp(-r2 / sigma) * (1.5 + 9.0 * a);
        float rs = mix(0.02, 1.2, sqrt(grow));
        float shock = exp(-pow((sqrt(r2) - rs) / (0.008 + 0.03 * grow), 2.0)) * 3.0 * (1.0 - grow);
        float veil = a * a * 0.25;
        core += shock;
        vec3 warm = vec3(1.0, 0.86, 0.7);
        vec3 cool = vec3(0.72, 0.84, 1.0);
        vec3 col = mix(warm, cool, smoothstep(0.0, 0.5, sqrt(r2))) * (core + veil);
        fragColor = vec4(col * a, 1.0);
      }`,
  });

  update(_f: FrameInfo) {
    this.pass.material.uniforms.uAmount!.value = this.weight;
    this.pass.material.uniforms.uProgress!.value = this.progress;
  }

  draw(renderer: WebGLRenderer) {
    renderer.render(this.pass.scene, this.pass.camera);
  }

  resize(_bw: number, _bh: number, cw: number, ch: number) {
    this.pass.material.uniforms.uAspect!.value = cw / ch;
  }

  fieldOfViewLog10() {
    return 0;
  }

  readouts(): Readout[] {
    return [];
  }

  dispose() {
    this.pass.dispose();
  }
}
