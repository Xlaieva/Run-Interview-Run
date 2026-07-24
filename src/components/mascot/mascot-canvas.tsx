"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";

const MODEL_URL = "/models/RobotExpressive.glb";

/**
 * Real animation clip names in RobotExpressive.glb (verified by parsing the
 * glb's JSON chunk directly): Dance, Death, Idle, Jump, No, Punch, Running,
 * Sitting, Standing, ThumbsUp, Walking, WalkJump, Wave, Yes. Only the ones
 * relevant to this widget are exposed here.
 */
export type MascotAction = "Idle" | "Wave" | "ThumbsUp" | "Yes";

/** 期望吉祥物在画面里呈现的高度（world units）。配合下方相机 fov/distance 调整这里。 */
const TARGET_HEIGHT = 1.5;

function RobotModel({ action, color }: { action: MascotAction; color?: string }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions } = useAnimations(animations, group);
  const currentActionRef = useRef<MascotAction>("Idle");

  // 模型自带的站立姿势实际高度约 4.8 个 three.js 单位（不是常见的人形角色 ~1.7 单位），
  // 硬编码的经验缩放/偏移量之前导致只有腿部落在相机取景框里。这里改成用真实包围盒
  // 算出的缩放和居中偏移，不管模型原始尺寸是多少都能让它完整、居中显示。
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = TARGET_HEIGHT / size.y;
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  }, [scene]);

  // "可贴图"接口的最简单版本：给 Main 材质换个颜色（模型本身没有预烘焙贴图）。
  useEffect(() => {
    if (!color) return;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        if (mat.name === "Main" && "color" in mat) {
          (mat as THREE.MeshStandardMaterial).color.set(color);
        }
      }
    });
  }, [scene, color]);

  // 常驻 Idle 循环动画。
  useEffect(() => {
    const idle = actions["Idle"];
    idle?.reset().play();
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
    };
  }, [actions]);

  // 手势动作：播放一次后自动淡出回到 Idle。
  // three.js 的 AnimationAction 是命令式、可变的原生对象（reset/play/fadeIn 等本身就是
  // 会修改自身状态的方法调用），并非 React 管理的状态——这是 drei useAnimations 官方推荐
  // 的驱动动画方式，因此这里针对 react-hooks/immutability 规则做局部豁免。
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    const next = action;
    const prev = currentActionRef.current;
    if (next === prev || next === "Idle") return;

    const nextAction = actions[next];
    const prevAction = actions[prev];
    if (!nextAction) return;

    nextAction.reset().setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;
    nextAction.fadeIn(0.25).play();
    prevAction?.fadeOut(0.25);
    currentActionRef.current = next;

    const durationMs = (nextAction.getClip().duration || 1) * 1000;
    const timer = window.setTimeout(() => {
      nextAction.fadeOut(0.25);
      actions["Idle"]?.reset().fadeIn(0.25).play();
      currentActionRef.current = "Idle";
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [action, actions]);
  /* eslint-enable react-hooks/immutability */

  return <primitive ref={group} object={scene} />;
}

useGLTF.preload(MODEL_URL);

export function MascotCanvas({ action, color }: { action: MascotAction; color?: string }) {
  return (
    <Canvas camera={{ position: [0, 1, 3.2], fov: 30 }} dpr={[1, 2]} gl={{ alpha: true }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
      <Suspense fallback={null}>
        <RobotModel action={action} color={color} />
      </Suspense>
    </Canvas>
  );
}
