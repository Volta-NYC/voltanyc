"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import countriesTopology from "world-atlas/countries-110m.json";
import landTopology from "world-atlas/land-110m.json";
import type { ChapterConnection, ChapterLocation } from "@/data/network";

type Tooltip = {
  name: string;
  state?: string;
  subtitle?: string;
  x: number;
  y: number;
};

type Props = {
  locations: ChapterLocation[];
  connections: ChapterConnection[];
};

const GLOBE_RADIUS = 2.15;
const HUB_COLOR = "#BEA2BA";
const CHAPTER_COLOR = "#F6B78D";
const INTERNATIONAL_COLOR = "#BEA2BA";
const NETWORK_ACCENT = "#F3E28D";

type Coordinate = [number, number];
type Polygon = Coordinate[][];

type LandFeatureCollection = {
  features: Array<{
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: Polygon | Polygon[];
    } | null;
  }>;
};

function toSpherePoint(lat: number, lng: number, radius = GLOBE_RADIUS) {
  const latitude = THREE.MathUtils.degToRad(lat);
  const longitude = THREE.MathUtils.degToRad(lng);

  return new THREE.Vector3(
    radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    // This longitude convention keeps west-to-east geography left-to-right
    // from the North America-facing camera.
    -radius * Math.cos(latitude) * Math.sin(longitude),
  );
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (!context) return new THREE.CanvasTexture(canvas);

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.48, "rgba(255, 255, 255, 0.2)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

function addGlobeGrid(group: THREE.Group) {
  const material = new THREE.LineBasicMaterial({
    color: "#E7DAC0",
    transparent: true,
    opacity: 0.28,
  });

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const points = Array.from({ length: 97 }, (_, index) => toSpherePoint(latitude, -180 + index * 3, GLOBE_RADIUS + 0.006));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let longitude = -150; longitude <= 180; longitude += 30) {
    const points = Array.from({ length: 61 }, (_, index) => toSpherePoint(-90 + index * 3, longitude, GLOBE_RADIUS + 0.006));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
}

function unwrapRing(ring: Coordinate[]) {
  let previousLongitude = ring[0]?.[0] ?? 0;

  return ring.map(([longitude, latitude], index) => {
    let unwrappedLongitude = longitude;

    if (index > 0) {
      while (unwrappedLongitude - previousLongitude > 180) unwrappedLongitude -= 360;
      while (unwrappedLongitude - previousLongitude < -180) unwrappedLongitude += 360;
    }

    previousLongitude = unwrappedLongitude;
    return [unwrappedLongitude, latitude] as Coordinate;
  });
}

function createLandTexture() {
  const land = feature(
    landTopology as never,
    landTopology.objects.land as never,
  ) as unknown as LandFeatureCollection;
  const countries = feature(
    countriesTopology as never,
    countriesTopology.objects.countries as never,
  ) as unknown as LandFeatureCollection;
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  if (!context) return new THREE.CanvasTexture(canvas);

  const project = ([longitude, latitude]: Coordinate, offset = 0) => [
    ((longitude + 180) / 360) * canvas.width + offset,
    ((90 - latitude) / 180) * canvas.height,
  ] as const;

  const drawGeometry = (
    collection: LandFeatureCollection,
    drawPolygon: (rings: Coordinate[][], offset: number) => void,
  ) => {
    collection.features.forEach(({ geometry }) => {
      if (!geometry) return;
      const polygons = geometry.type === "Polygon"
        ? [geometry.coordinates as Polygon]
        : geometry.coordinates as Polygon[];

      polygons.forEach((polygon) => {
        const rings = polygon.map(unwrapRing);
        if (!rings[0] || rings[0].length < 4) return;
        [-canvas.width, 0, canvas.width].forEach((offset) => drawPolygon(rings, offset));
      });
    });
  };

  // Red carries land while green carries country edges. The shader uses the
  // two channels to lift continents and keep borders visible at any rotation.
  drawGeometry(land, (rings, offset) => {
    context.beginPath();
    rings.forEach((ring) => {
      ring.forEach((point, index) => {
        const [x, y] = project(point, offset);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    });
    context.fillStyle = "rgb(255, 0, 0)";
    context.fill("evenodd");
  });

  drawGeometry(countries, (rings, offset) => {
    rings.forEach((ring) => {
      context.beginPath();
      ring.forEach((point, index) => {
        const [x, y] = project(point, offset);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.strokeStyle = "rgb(255, 255, 0)";
      context.lineWidth = 1.35;
      context.stroke();
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export default function NetworkGlobe({ locations, connections }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const compactViewport = window.matchMedia("(max-width: 639px)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(compactViewport ? 52 : 45, 1, 0.1, 100);
    const cameraDirection = toSpherePoint(38, -98).normalize();
    const defaultCameraDistance = compactViewport ? 6.6 : 6.4;
    const minCameraDistance = compactViewport ? 5.2 : 4.9;
    const maxCameraDistance = compactViewport ? 9.2 : 8.8;
    let cameraDistance = defaultCameraDistance;
    camera.position.copy(cameraDirection).multiplyScalar(cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compactViewport ? 1.25 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const globeSweep = new THREE.Group();
    scene.add(globeSweep);

    const globe = new THREE.Group();
    globeSweep.add(globe);

    const landTexture = createLandTexture();

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, compactViewport ? 96 : 180, compactViewport ? 64 : 120),
      new THREE.ShaderMaterial({
        uniforms: {
          landMap: { value: landTexture },
          surfaceColor: { value: new THREE.Color("#29495A") },
          landColor: { value: new THREE.Color("#B8A37B") },
          borderColor: { value: new THREE.Color("#F1E5CC") },
        },
        vertexShader: `
          uniform sampler2D landMap;
          varying vec3 vNormal;
          varying vec2 vMapUv;
          const float PI = 3.14159265359;
          void main() {
            vec3 radialNormal = normalize(normal);
            float longitude = atan(-radialNormal.z, radialNormal.x);
            float latitude = asin(clamp(radialNormal.y, -1.0, 1.0));
            vMapUv = vec2((longitude + PI) / (2.0 * PI), 0.5 + latitude / PI);
            float land = texture2D(landMap, vMapUv).r;
            vNormal = radialNormal;
            vec3 raisedPosition = position + radialNormal * land * 0.05;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(raisedPosition, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D landMap;
          uniform vec3 surfaceColor;
          uniform vec3 landColor;
          uniform vec3 borderColor;
          varying vec3 vNormal;
          varying vec2 vMapUv;
          void main() {
            vec3 normal = normalize(vNormal);
            vec4 mapData = texture2D(landMap, vMapUv);
            float land = mapData.r;
            float border = mapData.g;
            vec3 color = mix(surfaceColor, landColor, land);
            color = mix(color, borderColor, border * 0.88);
            float light = 0.82 + 0.18 * max(dot(normal, normalize(vec3(-0.5, 0.72, 0.65))), 0.0);
            gl_FragColor = vec4(color * light, 0.96);
          }
        `,
        transparent: true,
      }),
    );
    globe.add(earth);
    addGlobeGrid(globe);

    scene.add(new THREE.HemisphereLight("#F9F5F8", "#171317", 1.25));
    const rimLight = new THREE.DirectionalLight("#BEA2BA", 1.4);
    rimLight.position.set(-4, 3, 5);
    scene.add(rimLight);

    const glowTexture = createGlowTexture();
    const locationsByName = new Map(locations.map((location) => [location.name, location]));
    const markerTargets: THREE.Mesh[] = [];
    const hubGlows: Array<{ sprite: THREE.Sprite; scale: number }> = [];
    const curves: Array<{ curve: THREE.CatmullRomCurve3; pulse: THREE.Mesh; phase: number }> = [];

    locations.forEach((location) => {
      const isHub = location.type === "hub";
      // Members abroad are real but few, and no arc runs out to them, so they
      // read as a quieter tier: lavender rather than peach, and dimmer and
      // smaller than a domestic pin.
      const isInternational = location.type === "international";
      const color = isHub ? HUB_COLOR : isInternational ? INTERNATIONAL_COLOR : CHAPTER_COLOR;
      const point = toSpherePoint(location.lat, location.lng, GLOBE_RADIUS + 0.085);
      const glowScale = isHub ? 0.18 : isInternational ? 0.085 : 0.12;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: isHub ? 0.46 : isInternational ? 0.16 : 0.22,
        depthWrite: false,
      }));
      glow.position.copy(point.clone().multiplyScalar(1.025));
      glow.scale.setScalar(glowScale);
      globe.add(glow);

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(isHub ? 0.046 : isInternational ? 0.024 : 0.034, 16, 16),
        new THREE.MeshBasicMaterial({ color }),
      );
      marker.position.copy(point);
      globe.add(marker);

      // Keep visual nodes compact while making each chapter easy to identify
      // on hover or tap, including in the dense Northeast cluster.
      const hitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(isHub ? 0.11 : 0.085, 12, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitTarget.position.copy(point.clone().multiplyScalar(1.02));
      hitTarget.userData.location = location;
      globe.add(hitTarget);
      markerTargets.push(hitTarget);

      if (isHub) hubGlows.push({ sprite: glow, scale: glowScale });
    });

    connections.forEach(([fromName, toName], index) => {
      const from = locationsByName.get(fromName);
      const to = locationsByName.get(toName);
      if (!from || !to) return;

      const start = toSpherePoint(from.lat, from.lng, GLOBE_RADIUS + 0.095);
      const end = toSpherePoint(to.lat, to.lng, GLOBE_RADIUS + 0.095);
      const angularDistance = start.clone().normalize().angleTo(end.clone().normalize());
      const arcLift = 0.012 + Math.min(0.12, angularDistance * 0.23);
      const middle = start.clone().add(end).normalize().multiplyScalar(GLOBE_RADIUS + arcLift);
      const curve = new THREE.CatmullRomCurve3([start, middle, end]);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(compactViewport ? 56 : 80)),
        new THREE.LineBasicMaterial({ color: CHAPTER_COLOR, transparent: true, opacity: 0.27 }),
      );
      globe.add(line);

      if (angularDistance > 0.2) {
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.009, 10, 10),
          new THREE.MeshBasicMaterial({ color: NETWORK_ACCENT, transparent: true, opacity: 0.5 }),
        );
        globe.add(pulse);
        curves.push({ curve, pulse, phase: index * 0.5 });
      }
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragStart = new THREE.Vector2();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const activePointers = new Map<number, THREE.Vector2>();
    let activeLocation = "";
    let isDragging = false;
    let dragDistance = 0;
    let pinchDistance = 0;
    let pinchAngle = Number.NaN;
    const pinchCenter = new THREE.Vector2();
    let animationFrame = 0;
    let isVisible = !("IntersectionObserver" in window);
    let pageVisible = !document.hidden;
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      if (reducedMotion) renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const updateCameraDistance = (nextDistance: number) => {
      cameraDistance = THREE.MathUtils.clamp(nextDistance, minCameraDistance, maxCameraDistance);
      camera.position.copy(cameraDirection).multiplyScalar(cameraDistance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      if (reducedMotion) renderer.render(scene, camera);
    };

    const clearTooltip = () => {
      activeLocation = "";
      renderer.domElement.style.cursor = "grab";
      setTooltip(null);
    };

    const getPinchGesture = () => {
      const [first, second] = [...activePointers.values()];
      const center = first.clone().add(second).multiplyScalar(0.5);
      return {
        distance: first.distanceTo(second),
        angle: Math.atan2(second.y - first.y, second.x - first.x),
        center,
      };
    };

    const updateTooltip = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerTargets, false)[0];

      if (!hit) {
        if (activeLocation) clearTooltip();
        return false;
      }

      const location = hit.object.userData.location as ChapterLocation;
      activeLocation = location.name;
      renderer.domElement.style.cursor = "pointer";
      setTooltip({
        name: location.globeLabel ?? location.name,
        state: location.globeLabel ? undefined : (location.type === "chapter" ? location.state : undefined),
        subtitle: location.subtitle,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      return true;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") event.preventDefault();
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      }

      if (activePointers.size === 2) {
        const gesture = getPinchGesture();
        if (pinchDistance > 0) updateCameraDistance(cameraDistance - (gesture.distance - pinchDistance) * 0.012);
        if (Number.isFinite(pinchAngle)) {
          const angleDelta = Math.atan2(
            Math.sin(gesture.angle - pinchAngle),
            Math.cos(gesture.angle - pinchAngle),
          );
          globe.rotateOnWorldAxis(worldUp, angleDelta * 1.65);
        }
        const centerDelta = gesture.center.clone().sub(pinchCenter);
        globe.rotateOnWorldAxis(worldUp, centerDelta.x * 0.0035);
        globe.rotateOnWorldAxis(cameraRight, centerDelta.y * 0.0035);
        pinchDistance = gesture.distance;
        pinchAngle = gesture.angle;
        pinchCenter.copy(gesture.center);
        if (reducedMotion) renderer.render(scene, camera);
        return;
      }

      if (isDragging) {
        const deltaX = event.clientX - dragStart.x;
        const deltaY = event.clientY - dragStart.y;
        dragDistance += Math.hypot(deltaX, deltaY);
        globe.rotateOnWorldAxis(worldUp, deltaX * 0.0045);
        globe.rotateOnWorldAxis(cameraRight, deltaY * 0.0045);
        dragStart.set(event.clientX, event.clientY);
        if (reducedMotion) renderer.render(scene, camera);
        return;
      }

      updateTooltip(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.pointerType === "touch") event.preventDefault();
      activePointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (activePointers.size === 2) {
        const gesture = getPinchGesture();
        pinchDistance = gesture.distance;
        pinchAngle = gesture.angle;
        pinchCenter.copy(gesture.center);
        // A two-finger gesture owns the viewport, so the idle sweep must pause
        // until both pointers are released.
        isDragging = true;
        renderer.domElement.setPointerCapture(event.pointerId);
        renderer.domElement.style.cursor = "grabbing";
        return;
      }
      isDragging = true;
      dragDistance = 0;
      dragStart.set(event.clientX, event.clientY);
      activeLocation = "";
      setTooltip(null);
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };

    const onPointerUp = (event: PointerEvent) => {
      const wasDragging = isDragging;
      activePointers.delete(event.pointerId);
      isDragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      if (activePointers.size === 2) {
        const gesture = getPinchGesture();
        pinchDistance = gesture.distance;
        pinchAngle = gesture.angle;
        pinchCenter.copy(gesture.center);
      } else {
        pinchDistance = 0;
        pinchAngle = Number.NaN;
      }
      if (activePointers.size === 1) {
        const remainingPointer = [...activePointers.values()][0];
        isDragging = true;
        dragDistance = 0;
        dragStart.copy(remainingPointer);
        return;
      }
      if (wasDragging && dragDistance < 6) updateTooltip(event);
      else renderer.domElement.style.cursor = "grab";
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      updateCameraDistance(cameraDistance + event.deltaY * 0.006);
    };

    const onPointerLeave = () => {
      if (!isDragging && activePointers.size < 2) clearTooltip();
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const render = () => {
      animationFrame = 0;
      const elapsed = (performance.now() - startedAt) / 1000;
      const motionElapsed = reducedMotion ? 0 : elapsed;
      if (!reducedMotion && !isDragging) {
        globeSweep.rotation.y = Math.sin(elapsed * 0.09) * (compactViewport ? 0.32 : 0.44);
        globeSweep.rotation.z = Math.sin(elapsed * 0.075) * 0.028;
      }
      hubGlows.forEach(({ sprite, scale }) => {
        const pulse = 1 + Math.sin(motionElapsed * 2) * 0.11;
        sprite.scale.setScalar(scale * pulse);
      });
      curves.forEach(({ curve, pulse, phase }) => {
        pulse.position.copy(curve.getPoint((motionElapsed * 0.055 + phase) % 1));
      });
      renderer.render(scene, camera);
      if (!reducedMotion && isVisible && pageVisible) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const startRendering = () => {
      if (!isVisible || !pageVisible || animationFrame) return;
      animationFrame = window.requestAnimationFrame(render);
    };

    const stopRendering = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const visibilityObserver = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) startRendering();
        else stopRendering();
      })
      : null;
    const handleVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) startRendering();
      else stopRendering();
    };

    visibilityObserver?.observe(mount);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    render();

    return () => {
      stopRendering();
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      globe.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }

        if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      glowTexture.dispose();
      landTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [connections, locations]);

  return (
    <div ref={mountRef} className="network-globe-canvas relative h-[360px] w-full touch-none sm:h-[460px] lg:h-[560px]" aria-hidden="true">
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md border border-white/20 bg-n-dark/90 px-3 py-2 font-body text-xs text-white shadow-lg backdrop-blur-sm"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold">{tooltip.state ? `${tooltip.name}, ${tooltip.state}` : tooltip.name}</p>
          {tooltip.subtitle && <p className="mt-0.5 text-[10px] uppercase tracking-[0.13em] text-n-orange">{tooltip.subtitle}</p>}
        </div>
      )}
    </div>
  );
}
