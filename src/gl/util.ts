import {
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type ShaderMaterialParameters,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import fullscreenVert from './shaders/fullscreen.vert';

/** A single triangle covering the viewport — avoids the diagonal seam of a quad. */
export function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
}

export class FullscreenPass {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor(params: ShaderMaterialParameters) {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: fullscreenVert,
      depthTest: false,
      depthWrite: false,
      ...params,
    });
    this.mesh = new Mesh(fullscreenTriangle(), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  get material() {
    return this.mesh.material;
  }

  render(renderer: WebGLRenderer, target: WebGLRenderTarget | null) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export const clamp = (x: number, a = 0, b = 1) => Math.min(Math.max(x, a), b);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

/** Piecewise-linear keyframe interpolation with smoothstep easing between keys. */
export function keyframes(keys: [number, number][], t: number): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    const [t0, v0] = keys[i - 1]!;
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return lerp(v0, v1, u * u * (3 - 2 * u));
    }
  }
  return keys[keys.length - 1]![1];
}
