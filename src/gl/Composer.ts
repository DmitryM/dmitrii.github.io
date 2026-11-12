import { HalfFloatType, PerspectiveCamera, Uniform, Vector2, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import {
  Effect,
  EffectAttribute,
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  Pass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Chapter } from './Chapter';
import type { Tier } from './Quality';

/** Renders every visible chapter into the composer's HDR buffer (additively). */
class CompositePass extends Pass {
  constructor(private readonly active: () => Chapter[]) {
    super('CompositePass');
    this.needsSwap = false;
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null) {
    const chapters = this.active();
    for (const c of chapters) c.prepare?.(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    for (const c of chapters) c.draw(renderer);
  }
}

/**
 * Radial zoom blur, driven by how fast the field of view's scale is changing (orders of magnitude
 * per second). It gives the Powers-of-Ten sweeps and the plunge a physical sense of speed.
 */
class ZoomBlurEffect extends Effect {
  constructor() {
    super(
      'ZoomBlurEffect',
      /* glsl */ `
      uniform float strength;
      uniform vec2 center;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (strength < 0.0005) { outputColor = inputColor; return; }
        vec2 d = uv - center;
        float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 16; i++) {
          float t = (float(i) + jitter) / 16.0;
          float w = 1.0 - 0.6 * t;
          acc += texture2D(inputBuffer, center + d * (1.0 - strength * t)).rgb * w;
          wsum += w;
        }
        outputColor = vec4(acc / wsum, inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION,
        uniforms: new Map<string, Uniform>([
          ['strength', new Uniform(0)],
          ['center', new Uniform(new Vector2(0.5, 0.5))],
        ]),
      },
    );
  }
}

export class Composer {
  readonly composer: EffectComposer;
  readonly bloom: BloomEffect;
  readonly vignette: VignetteEffect;
  readonly grain: NoiseEffect;
  readonly aberration: ChromaticAberrationEffect;
  private readonly effects: EffectPass;
  private readonly zoomBlur = new ZoomBlurEffect();
  private readonly zoomPass: EffectPass;

  constructor(renderer: WebGLRenderer, tier: Tier, active: () => Chapter[]) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0, stencilBuffer: false });
    this.composer.autoRenderToScreen = true;
    const camera = new PerspectiveCamera();

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.8,
      luminanceSmoothing: 0.4,
      intensity: 1.05,
      radius: 0.74,
      levels: tier.bloomLevels,
    });
    this.aberration = new ChromaticAberrationEffect({
      offset: new Vector2(0.00055, 0.00055),
      radialModulation: true,
      modulationOffset: 0.4,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.58 });
    this.grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    this.grain.blendMode.opacity.value = 0.22;

    this.composer.addPass(new CompositePass(active));
    this.zoomPass = new EffectPass(camera, this.zoomBlur);
    this.zoomPass.enabled = false;
    this.composer.addPass(this.zoomPass);
    this.effects = new EffectPass(camera, this.aberration, this.bloom, tone, this.vignette, this.grain);
    this.effects.dithering = true;
    this.composer.addPass(this.effects);
  }

  /** strength: fraction of the radius smeared (0 disables the pass); centre in UV */
  setZoomBlur(strength: number, cx = 0.5, cy = 0.5) {
    this.zoomPass.enabled = strength > 0.002;
    this.zoomBlur.uniforms.get('strength')!.value = strength;
    (this.zoomBlur.uniforms.get('center')!.value as Vector2).set(cx, cy);
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height, false);
  }

  render(dt: number) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
