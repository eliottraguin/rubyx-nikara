'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { MapBus } from '@/game/map/bus';
import type { MapViewModel, PlanetVM } from '@/game/map/viewmodel';

interface CitySceneProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bus: MapBus;
  onError: (message: string) => void;
}

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  buildings: Map<string, THREE.Mesh>;
  animate: () => void;
  dispose: () => void;
}

export function CityScene({ containerRef, bus, onError }: CitySceneProps) {
  const stateRef = useRef<SceneState | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    try {
      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87ceeb);
      scene.fog = new THREE.Fog(0x87ceeb, 100, 200);

      // Camera
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(10, 15, 10);
      camera.lookAt(0, 0, 0);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      container.appendChild(renderer.domElement);

      // Lighting
      const sunLight = new THREE.DirectionalLight(0xffffff, 1);
      sunLight.position.set(20, 30, 20);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.far = 100;
      sunLight.shadow.camera.left = -50;
      sunLight.shadow.camera.right = 50;
      sunLight.shadow.camera.top = 50;
      sunLight.shadow.camera.bottom = -50;
      scene.add(sunLight);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      // Ground
      const groundGeometry = new THREE.PlaneGeometry(100, 100);
      const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a2d });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);

      // Clouds (similar to login scene)
      const cloudGeometry = new THREE.BufferGeometry();
      const cloudPositions: number[] = [];
      for (let i = 0; i < 30; i++) {
        cloudPositions.push(
          Math.random() * 80 - 40,
          15 + Math.random() * 10,
          Math.random() * 80 - 40
        );
      }
      cloudGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(cloudPositions), 3)
      );
      const cloudMaterial = new THREE.PointsMaterial({
        size: 1,
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
      });
      const clouds = new THREE.Points(cloudGeometry, cloudMaterial);
      scene.add(clouds);

      // Raycasting
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const buildings = new Map<string, THREE.Mesh>();

      // Handle building creation
      function updateBuildings(vm: MapViewModel | null) {
        if (!vm) return;

        // Clear existing buildings
        buildings.forEach((mesh) => {
          scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        });
        buildings.clear();

        // Create HQ building (player's building)
        const hqGeometry = new THREE.BoxGeometry(4, 8, 4);
        const hqMaterial = new THREE.MeshStandardMaterial({
          color: 0xff6b6b,
          metalness: 0.3,
          roughness: 0.6,
        });
        const hqMesh = new THREE.Mesh(hqGeometry, hqMaterial);
        hqMesh.position.set(0, 4, 0);
        hqMesh.castShadow = true;
        hqMesh.receiveShadow = true;
        hqMesh.userData.id = 'base';
        scene.add(hqMesh);
        buildings.set('base', hqMesh);

        // Create planet/location buildings
        vm.planets.forEach((planet, index) => {
          // Disposition déterministe en anneau (aucun aléa : même état => même ville).
          const angle = (index / Math.max(vm.planets.length, 1)) * Math.PI * 2;
          const radius = 16 + (index % 2) * 6;
          const x = radius * Math.cos(angle);
          const z = radius * Math.sin(angle);
          const height = 4 + Math.min(planet.floors ?? 3, 8);
          const geometry = new THREE.BoxGeometry(3, height, 3);

          // Color based on status
          let color = 0x888888; // default gray
          if (planet.status === 'locked') color = 0x444444;
          else if (planet.status === 'available') color = 0x4a9a4a;
          else if (planet.status === 'in_progress') color = 0xc17a00;
          else if (planet.status === 'visited') color = 0x4a7ab3;

          const material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.2,
            roughness: 0.7,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(x, height / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.id = planet.id;
          scene.add(mesh);
          buildings.set(planet.id, mesh);
        });
      }

      // Mouse interaction
      function onMouseClick(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(
          Array.from(buildings.values())
        );

        if (intersects.length > 0) {
          const id = (intersects[0]!.object.userData.id as string | undefined) ?? null;
          bus.emit('planet:select', id as string | null);
        } else {
          bus.emit('planet:select', null);
        }
      }

      function onMouseMove(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(
          Array.from(buildings.values())
        );

        const hoverId: string | null = intersects.length > 0
          ? (intersects[0]!.object.userData.id as string | undefined) ?? null
          : null;
        bus.emit('planet:hover', hoverId);
      }

      renderer.domElement.addEventListener('click', onMouseClick);
      renderer.domElement.addEventListener('mousemove', onMouseMove);

      // Animation loop
      let animationFrameId: number;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        // Rotate clouds slowly
        clouds.rotation.y += 0.00005;

        renderer.render(scene, camera);
      };

      // Handle window resize
      const handleResize = () => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      };

      // Bus event handlers
      const unsubVM = bus.on('vm', (vm) => {
        updateBuildings(vm);
      });

      const unsubSel = bus.on('selected', (id) => {
        buildings.forEach((m, key) => {
          (m.material as THREE.MeshStandardMaterial).emissive.setHex(key === id ? 0x333333 : 0x000000);
        });
      });

      // Initial state
      if (bus.vm) {
        updateBuildings(bus.vm);
      }

      window.addEventListener('resize', handleResize);
      animate();

      // Emit scene ready
      bus.emit('scene:ready');

      // Store state for cleanup
      stateRef.current = {
        scene,
        camera,
        renderer,
        raycaster,
        mouse,
        buildings,
        animate,
        dispose: () => {
          window.removeEventListener('resize', handleResize);
          renderer.domElement.removeEventListener('click', onMouseClick);
          renderer.domElement.removeEventListener('mousemove', onMouseMove);
          cancelAnimationFrame(animationFrameId);
          unsubVM();
          unsubSel();
          container.removeChild(renderer.domElement);
          renderer.dispose();
        },
      };
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : 'Unknown error');
    }

    return () => {
      stateRef.current?.dispose();
      stateRef.current = null;
    };
  }, [containerRef, bus]);

  return null;
}
