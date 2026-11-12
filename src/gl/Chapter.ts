import type { WebGLRenderer } from 'three';

export interface Pointer {
  /** smoothed, −1…1 (right / up positive) */
  x: number;
  y: number;
}

export interface FrameInfo {
  time: number;
  dt: number;
  pointer: Pointer;
  /** CSS pixels */
  width: number;
  height: number;
  /** drawing-buffer pixels */
  bufferWidth: number;
  bufferHeight: number;
  dpr: number;
}

export type Readout = [label: string, value: string];

export interface Chapter {
  readonly name: string;
  /** 0 = invisible (skipped), 1 = fully visible. Set by the Director. */
  weight: number;
  update(frame: FrameInfo): void;
  /** offscreen work (own render targets) before the main buffer is bound */
  prepare?(renderer: WebGLRenderer): void;
  /** draw into the currently bound HDR target (additively composited) */
  draw(renderer: WebGLRenderer): void;
  resize(bufferWidth: number, bufferHeight: number, cssWidth: number, cssHeight: number): void;
  /** log10 of the width of the field of view in metres — drives the HUD scale counter */
  fieldOfViewLog10(): number;
  readouts(): Readout[];
  dispose(): void;
}
