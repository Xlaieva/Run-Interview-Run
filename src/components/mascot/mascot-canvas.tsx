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

function RobotModel({ action, color }: { action: MascotAction; color?: string }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions } = useAnimations(animations, group);
  const currentActionRef = useRef<MascotAction>("Idle");

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

  return <primitive ref={group} object={scene} scale={0.9} position={[0, -1, 0]} />;
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
