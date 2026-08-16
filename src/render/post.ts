// The post chain: selective bloom on the three emissive palette steps, plus a
// light vignette. ART_DIRECTION §2 rule 2 fixes what may bloom — amber-glow,
// overload-100, veinglass-100 and nothing else — so the chain does not threshold
// the beauty image (which would catch lit terrain, whose top face is a mid grey)
// but renders a second time with the camera restricted to BLOOM_LAYER. Only
// geometry that declared itself emissive is in that render, so the keying is
// exact rather than luminance-guessed.
//
// The source art deliberately omits soft halos (§3: emissives are crisp-edged
// and unoutlined). This is the engine side of that bargain — the halo is light,
// and light is the renderer's job.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BASE_LAYER, BLOOM_LAYER } from "./layers.js";

/**
 * Industrial, not cinematic: a machine seam gains a halo about a third of a tile
 * across and nothing else changes. The radius is tight because a wide bloom
 * turns a foundry into a nightclub, and because a 1px-outlined sprite standing
 * next to a lamp must not lose its edge to it.
 */
export const BLOOM_STRENGTH = 0.45;
export const BLOOM_RADIUS = 0.28;
/** Everything in the bloom render is emissive by construction. */
export const BLOOM_THRESHOLD = 0;
/** Fraction of centre luminance lost at the corners. */
export const VIGNETTE = 0.22;

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
uniform float vignette;
varying vec2 vUv;
void main() {
  vec4 base = texture2D(baseTexture, vUv);
  vec3 lit = base.rgb + texture2D(bloomTexture, vUv).rgb;
  vec2 offset = vUv - 0.5;
  float falloff = 1.0 - vignette * clamp(dot(offset, offset) * 2.0, 0.0, 1.0);
  // A vignette across an almost-black sky banks into visible rings at 8 bits.
  // Half a code value of hash noise costs nothing and removes them.
  float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(lit * falloff + noise / 255.0, base.a);
}
`;

export interface PostChainOptions {
  readonly strength?: number;
  readonly radius?: number;
  readonly vignette?: number;
}

/**
 * Two composers over one scene. The bloom composer draws BLOOM_LAYER alone onto
 * black and blurs it; the final composer draws the beauty pass and adds that
 * target on top. If the composer cannot be built, `render` falls back to a plain
 * forward render — a driver without float render targets should cost the player
 * the halo, not the game.
 */
export class PostChain {
  readonly enabled: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly bloomComposer: EffectComposer | null = null;
  private readonly finalComposer: EffectComposer | null = null;
  private readonly occluderMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly occluders: THREE.Mesh[] = [];

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PostChainOptions = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    try {
      const size = renderer.getSize(new THREE.Vector2());
      const bloomPass = new UnrealBloomPass(
        size.clone(),
        options.strength ?? BLOOM_STRENGTH,
        options.radius ?? BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      );
      this.bloomComposer = new EffectComposer(renderer);
      this.bloomComposer.renderToScreen = false;
      this.bloomComposer.addPass(
        new RenderPass(scene, camera, null, new THREE.Color(0x000000), 1),
      );
      this.bloomComposer.addPass(bloomPass);

      const composite = new ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
            vignette: { value: options.vignette ?? VIGNETTE },
          },
          vertexShader: COMPOSITE_VERTEX,
          fragmentShader: COMPOSITE_FRAGMENT,
        }),
        "baseTexture",
      );

      // The beauty pass keeps the multisampling a direct render had: an ortho
      // board of hard-edged blocks aliases badly without it. The bloom target
      // does not need it — it is about to be blurred.
      const beautyTarget = new THREE.WebGLRenderTarget(
        Math.max(1, size.width * renderer.getPixelRatio()),
        Math.max(1, size.height * renderer.getPixelRatio()),
        { type: THREE.HalfFloatType, samples: 4 },
      );
      this.finalComposer = new EffectComposer(renderer, beautyTarget);
      this.finalComposer.addPass(new RenderPass(scene, camera));
      this.finalComposer.addPass(composite);
      this.finalComposer.addPass(new OutputPass());
      this.enabled = true;
    } catch (error) {
      console.warn("[greyfall] post chain unavailable; rendering forward", error);
      this.enabled = false;
    }
  }

  /**
   * Solid geometry that must stop a glow standing behind it. The bloom render
   * holds no beauty materials, so without these an amber seam behind an
   * impassable mass would halo straight through the rock.
   */
  setOccluders(meshes: readonly THREE.Mesh[]): void {
    this.occluders.length = 0;
    this.occluders.push(...meshes);
  }

  setSize(width: number, height: number): void {
    const pixelRatio = this.renderer.getPixelRatio();
    for (const composer of [this.bloomComposer, this.finalComposer]) {
      composer?.setPixelRatio(pixelRatio);
      composer?.setSize(width, height);
    }
  }

  render(): void {
    if (!this.enabled || !this.bloomComposer || !this.finalComposer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const background = this.scene.background;
    const swapped = this.occluders.map((mesh) => {
      const material = mesh.material;
      mesh.material = this.occluderMaterial;
      mesh.layers.enable(BLOOM_LAYER);
      return { mesh, material };
    });
    this.scene.background = null;
    this.camera.layers.set(BLOOM_LAYER);

    this.bloomComposer.render();

    this.camera.layers.set(BASE_LAYER);
    this.scene.background = background;
    for (const { mesh, material } of swapped) {
      mesh.material = material;
      mesh.layers.disable(BLOOM_LAYER);
    }

    this.finalComposer.render();
  }

  dispose(): void {
    this.bloomComposer?.dispose();
    this.finalComposer?.dispose();
    this.occluderMaterial.dispose();
    this.occluders.length = 0;
  }
}
