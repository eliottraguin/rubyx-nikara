'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { FloorId } from '@/game/building/floors';

interface BuildingInteriorSceneProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedFloor: FloorId | null;
  onFloorSelect: (floorId: FloorId) => void;
  onError: (message: string) => void;
}

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  floors: Map<FloorId, THREE.Mesh>;
  animate: () => void;
  dispose: () => void;
}

const FLOOR_CONFIG: Record<FloorId, { y: number; color: number; label: string }> = {
  toit: { y: 8, color: 0xff6b6b, label: 'Toit' },
  pub: { y: 6, color: 0xffa500, label: 'Studio pub' },
  courrier: { y: 4, color: 0x4a9a4a, label: 'Salle du courrier' },
  archives: { y: 2, color: 0x4a7ab3, label: 'Archives' },
  accueil: { y: 0, color: 0x888888, label: 'Accueil et garage' },
};

export function BuildingInteriorScene({
  containerRef,
  selectedFloor,
  onFloorSelect,
  onError,
}: BuildingInteriorSceneProps) {
  const stateRef = useRef<SceneState | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    try {
      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x333333);
      scene.fog = new THREE.Fog(0x333333, 50, 100);

      // Camera positioned to view building from the side
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(15, 4, 10);
      camera.lookAt(0, 4, 0);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      container.appendChild(renderer.domElement);

      // Lighting
      const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
      sunLight.position.set(20, 20, 20);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.far = 100;
      sunLight.shadow.camera.left = -30;
      sunLight.shadow.camera.right = 30;
      sunLight.shadow.camera.top = 30;
      sunLight.shadow.camera.bottom = -30;
      scene.add(sunLight);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      // Building structure: exterior walls
      const buildingGeometry = new THREE.BoxGeometry(4, 10, 4);
      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.1,
        roughness: 0.7,
      });
      const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
      buildingMesh.position.y = 5;
      buildingMesh.castShadow = true;
      buildingMesh.receiveShadow = true;
      scene.add(buildingMesh);

      // Ground
      const groundGeometry = new THREE.PlaneGeometry(30, 30);
      const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a2d });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1;
      ground.receiveShadow = true;
      scene.add(ground);

      // Raycasting for floor selection
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const floors = new Map<FloorId, THREE.Mesh>();

      // Create floor plates (clickable elements)
      const floorIds: FloorId[] = ['toit', 'pub', 'courrier', 'archives', 'accueil'];
      floorIds.forEach((floorId) => {
        const config = FLOOR_CONFIG[floorId];

        // Create a flat platform for each floor
        const floorGeometry = new THREE.BoxGeometry(4, 0.4, 4);
        const floorMaterial = new THREE.MeshStandardMaterial({
          color: config.color,
          metalness: 0.3,
          roughness: 0.6,
        });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.position.set(0, config.y, 0);
        floorMesh.castShadow = true;
        floorMesh.receiveShadow = true;
        floorMesh.userData.id = floorId;

        // Highlight selected floor
        if (floorId === selectedFloor) {
          const emissiveMaterial = new THREE.MeshStandardMaterial({
            color: config.color,
            metalness: 0.5,
            roughness: 0.4,
            emissive: config.color,
            emissiveIntensity: 0.3,
          });
          floorMesh.material = emissiveMaterial;
        }

        scene.add(floorMesh);
        floors.set(floorId, floorMesh);
      });

      // Mouse interaction
      function onMouseClick(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(Array.from(floors.values()));

        if (intersects.length > 0) {
          const id = intersects[0]!.object.userData.id as FloorId | undefined;
          if (id) {
            onFloorSelect(id);
          }
        }
      }

      function onMouseMove(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(Array.from(floors.values()));

        if (intersects.length > 0) {
          renderer.domElement.style.cursor = 'pointer';
        } else {
          renderer.domElement.style.cursor = 'default';
        }
      }

      renderer.domElement.addEventListener('click', onMouseClick);
      renderer.domElement.addEventListener('mousemove', onMouseMove);

      // Animation loop
      let animationFrameId: number;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
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

      window.addEventListener('resize', handleResize);
      animate();

      // Store state for cleanup
      stateRef.current = {
        scene,
        camera,
        renderer,
        raycaster,
        mouse,
        floors,
        animate,
        dispose: () => {
          window.removeEventListener('resize', handleResize);
          renderer.domElement.removeEventListener('click', onMouseClick);
          renderer.domElement.removeEventListener('mousemove', onMouseMove);
          cancelAnimationFrame(animationFrameId);
          container.removeChild(renderer.domElement);
          renderer.dispose();
        },
      };
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error');
    }

    return () => {
      stateRef.current?.dispose();
      stateRef.current = null;
    };
  }, [containerRef, onError]);

  // Update selected floor appearance when it changes
  useEffect(() => {
    if (!stateRef.current) return;

    const floors = stateRef.current.floors;
    const floorIds: FloorId[] = ['toit', 'pub', 'courrier', 'archives', 'accueil'];

    floorIds.forEach((floorId) => {
      const mesh = floors.get(floorId);
      if (!mesh) return;

      const config = FLOOR_CONFIG[floorId];

      if (floorId === selectedFloor) {
        const emissiveMaterial = new THREE.MeshStandardMaterial({
          color: config.color,
          metalness: 0.5,
          roughness: 0.4,
          emissive: config.color,
          emissiveIntensity: 0.3,
        });
        mesh.material = emissiveMaterial;
      } else {
        const standardMaterial = new THREE.MeshStandardMaterial({
          color: config.color,
          metalness: 0.3,
          roughness: 0.6,
        });
        mesh.material = standardMaterial;
      }
    });
  }, [selectedFloor]);

  return null;
}
