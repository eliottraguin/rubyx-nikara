'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createRng, generateSkyline, parseSeed } from '@/lib/city/generate-skyline';

interface LoginSceneProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function LoginScene({ containerRef }: LoginSceneProps) {
  const sceneRef = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.Camera; animate: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 9, 8);
    camera.lookAt(0, -2, -3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const lighting = new THREE.Group();
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(5, 10, 7);
    lighting.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    lighting.add(ambientLight);
    scene.add(lighting);

    // Ville d'ambiance vue de haut : seedée (reproductible), seed surchargeable via ?citySeed=
    const seed = parseSeed(new URLSearchParams(window.location.search).get('citySeed'));
    const specs = generateSkyline({ seed });
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const buildingMaterials = new Map<number, THREE.MeshStandardMaterial>();
    for (const spec of specs) {
      let material = buildingMaterials.get(spec.color);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color: spec.color });
        buildingMaterials.set(spec.color, material);
      }
      const building = new THREE.Mesh(unitBox, material);
      building.scale.set(spec.width, spec.height, spec.depth);
      building.position.set(spec.x, -2 + spec.height / 2, spec.z);
      scene.add(building);
    }

    const cloudGeometry = new THREE.BufferGeometry();
    const cloudPositions: number[] = [];
    const cloudRng = createRng(seed ^ 0x9e3779b9);
    for (let i = 0; i < 20; i++) {
      cloudPositions.push(cloudRng() * 24 - 12, 3 + cloudRng() * 4, cloudRng() * 12 - 9);
    }
    cloudGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cloudPositions), 3));

    const cloudMaterial = new THREE.PointsMaterial({ size: 0.5, color: 0xffffff, transparent: true, opacity: 0.7 });
    const clouds = new THREE.Points(cloudGeometry, cloudMaterial);
    scene.add(clouds);

    const groundGeometry = new THREE.PlaneGeometry(60, 60);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a2d });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      clouds.rotation.z += 0.0001;

      renderer.render(scene, camera);
    };

    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);
    animate();

    sceneRef.current = { scene, renderer, camera, animate };

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      container.removeChild(renderer.domElement);
    };
  }, [containerRef]);

  return null;
}
