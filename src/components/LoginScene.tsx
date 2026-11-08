'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

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
    camera.position.z = 5;

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

    const buildingGeometry = new THREE.BoxGeometry(1, 2, 1);
    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });

    for (let i = 0; i < 5; i++) {
      const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
      building.position.set((i - 2) * 2, 0, Math.random() * 2);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
    }

    const cloudGeometry = new THREE.BufferGeometry();
    const cloudPositions: number[] = [];
    for (let i = 0; i < 20; i++) {
      cloudPositions.push(Math.random() * 20 - 10, 3 + Math.random() * 4, Math.random() * 5 - 2.5);
    }
    cloudGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cloudPositions), 3));

    const cloudMaterial = new THREE.PointsMaterial({ size: 0.5, color: 0xffffff, transparent: true, opacity: 0.7 });
    const clouds = new THREE.Points(cloudGeometry, cloudMaterial);
    scene.add(clouds);

    const groundGeometry = new THREE.PlaneGeometry(20, 20);
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
