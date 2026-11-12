import { HalfFloatType, PerspectiveCamera, Vector2, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import {
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

export class Composer {
  readonly composer: EffectComposer;
  readonly bloom: BloomEffect;
  readonly vignette: VignetteEffect;
  readonly grain: NoiseEffect;
  readonly aberration: ChromaticAberrationEffect;
  private readonly effects: EffectPass;

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
    this.effects = new EffectPass(camera, this.aberration, this.bloom, tone, this.vignette, this.grain);
    this.effects.dithering = true;
    this.composer.addPass(this.effects);
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
