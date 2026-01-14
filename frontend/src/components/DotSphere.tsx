import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// =============================================================================
// World Map Texture Generation
// =============================================================================

function generateWorldMapTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Fill with ocean (black)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw simplified continents (white)
  ctx.fillStyle = '#ffffff'

  // Helper to convert lat/lon to canvas coords
  // lon: -180 to 180, lat: -90 to 90
  const toX = (lon: number) => ((lon + 180) / 360) * canvas.width
  const toY = (lat: number) => ((90 - lat) / 180) * canvas.height

  // Helper to draw ellipse (for islands)
  const drawIsland = (lon: number, lat: number, rx: number, ry: number) => {
    ctx.beginPath()
    ctx.ellipse(toX(lon), toY(lat), rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // North America (larger)
  ctx.beginPath()
  ctx.moveTo(toX(-170), toY(68))
  ctx.lineTo(toX(-140), toY(72))
  ctx.lineTo(toX(-95), toY(72))
  ctx.lineTo(toX(-75), toY(65))
  ctx.lineTo(toX(-55), toY(50))
  ctx.lineTo(toX(-70), toY(45))
  ctx.lineTo(toX(-75), toY(30))
  ctx.lineTo(toX(-85), toY(18))
  ctx.lineTo(toX(-105), toY(18))
  ctx.lineTo(toX(-120), toY(32))
  ctx.lineTo(toX(-128), toY(50))
  ctx.lineTo(toX(-145), toY(62))
  ctx.lineTo(toX(-168), toY(62))
  ctx.closePath()
  ctx.fill()

  // South America (larger)
  ctx.beginPath()
  ctx.moveTo(toX(-82), toY(12))
  ctx.lineTo(toX(-55), toY(5))
  ctx.lineTo(toX(-32), toY(-5))
  ctx.lineTo(toX(-38), toY(-22))
  ctx.lineTo(toX(-52), toY(-38))
  ctx.lineTo(toX(-68), toY(-56))
  ctx.lineTo(toX(-78), toY(-48))
  ctx.lineTo(toX(-82), toY(-18))
  ctx.lineTo(toX(-82), toY(0))
  ctx.closePath()
  ctx.fill()

  // Europe (larger)
  ctx.beginPath()
  ctx.moveTo(toX(-12), toY(72))
  ctx.lineTo(toX(35), toY(72))
  ctx.lineTo(toX(65), toY(72))
  ctx.lineTo(toX(55), toY(48))
  ctx.lineTo(toX(32), toY(42))
  ctx.lineTo(toX(8), toY(38))
  ctx.lineTo(toX(-12), toY(42))
  ctx.lineTo(toX(-12), toY(62))
  ctx.closePath()
  ctx.fill()

  // Africa (larger)
  ctx.beginPath()
  ctx.moveTo(toX(-22), toY(38))
  ctx.lineTo(toX(12), toY(38))
  ctx.lineTo(toX(45), toY(32))
  ctx.lineTo(toX(52), toY(12))
  ctx.lineTo(toX(52), toY(-8))
  ctx.lineTo(toX(42), toY(-22))
  ctx.lineTo(toX(28), toY(-38))
  ctx.lineTo(toX(12), toY(-38))
  ctx.lineTo(toX(8), toY(-22))
  ctx.lineTo(toX(-8), toY(5))
  ctx.lineTo(toX(-22), toY(18))
  ctx.closePath()
  ctx.fill()

  // Asia (larger, extended east)
  ctx.beginPath()
  ctx.moveTo(toX(58), toY(78))
  ctx.lineTo(toX(180), toY(72))
  ctx.lineTo(toX(175), toY(62))
  ctx.lineTo(toX(145), toY(52))
  ctx.lineTo(toX(148), toY(38))
  ctx.lineTo(toX(135), toY(28))
  ctx.lineTo(toX(122), toY(22))
  ctx.lineTo(toX(98), toY(18))
  ctx.lineTo(toX(88), toY(22))
  ctx.lineTo(toX(72), toY(22))
  ctx.lineTo(toX(52), toY(28))
  ctx.lineTo(toX(48), toY(45))
  ctx.lineTo(toX(52), toY(62))
  ctx.closePath()
  ctx.fill()

  // Japan
  ctx.beginPath()
  ctx.moveTo(toX(130), toY(45))
  ctx.lineTo(toX(145), toY(45))
  ctx.lineTo(toX(146), toY(38))
  ctx.lineTo(toX(142), toY(32))
  ctx.lineTo(toX(135), toY(32))
  ctx.lineTo(toX(130), toY(38))
  ctx.closePath()
  ctx.fill()

  // Indonesia/Philippines archipelago
  drawIsland(120, 5, 12, 6)
  drawIsland(105, -2, 15, 5)
  drawIsland(115, -5, 10, 4)
  drawIsland(125, 0, 8, 4)
  drawIsland(128, -8, 6, 3)

  // Australia (larger)
  ctx.beginPath()
  ctx.moveTo(toX(112), toY(-12))
  ctx.lineTo(toX(155), toY(-12))
  ctx.lineTo(toX(158), toY(-28))
  ctx.lineTo(toX(152), toY(-42))
  ctx.lineTo(toX(132), toY(-38))
  ctx.lineTo(toX(112), toY(-28))
  ctx.closePath()
  ctx.fill()

  // New Zealand
  drawIsland(175, -42, 6, 10)
  drawIsland(172, -45, 5, 8)

  // Pacific Islands
  drawIsland(-155, 20, 5, 3)   // Hawaii
  drawIsland(-170, -15, 4, 2)  // Samoa
  drawIsland(-180, -18, 4, 2)  // Fiji
  drawIsland(165, -22, 4, 3)   // New Caledonia
  drawIsland(-150, -18, 3, 2)  // Tahiti

  // Antarctica (partial, at bottom)
  ctx.beginPath()
  ctx.moveTo(toX(-180), toY(-68))
  ctx.lineTo(toX(180), toY(-68))
  ctx.lineTo(toX(180), toY(-90))
  ctx.lineTo(toX(-180), toY(-90))
  ctx.closePath()
  ctx.fill()

  // Greenland (larger)
  ctx.beginPath()
  ctx.moveTo(toX(-48), toY(58))
  ctx.lineTo(toX(-18), toY(62))
  ctx.lineTo(toX(-18), toY(82))
  ctx.lineTo(toX(-62), toY(82))
  ctx.lineTo(toX(-58), toY(62))
  ctx.closePath()
  ctx.fill()

  // Iceland
  drawIsland(-20, 65, 8, 5)

  // UK/Ireland
  drawIsland(-5, 54, 6, 8)
  drawIsland(-8, 53, 4, 5)

  // Madagascar
  drawIsland(47, -20, 5, 12)

  // Sri Lanka
  drawIsland(81, 7, 4, 5)

  // Taiwan
  drawIsland(121, 24, 4, 5)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return texture
}

// =============================================================================
// GLSL Shaders
// =============================================================================

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPointSize;
  uniform float uProgress;
  uniform vec2 uMouse;
  uniform float uPixelRatio;

  attribute vec3 aRandom;

  varying float vDepth;
  varying float vNoise;
  varying vec2 vUV;

  //
  // Simplex 3D Noise
  // by Ian McEwan, Ashima Arts
  //
  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    // Scatter-to-sphere animation (reduced from 2.5 to stay within viewport)
    vec3 scatteredPos = position + aRandom * 1.0;
    vec3 currentPos = mix(scatteredPos, position, uProgress);

    // Organic noise displacement
    float noiseFreq = 1.2;
    float noiseAmp = 0.025;
    float slowTime = uTime * 0.12;

    vec3 noiseInput = currentPos * noiseFreq + slowTime;
    float noise = snoise(noiseInput);
    vNoise = noise;

    // Displace along the radial direction (outward from center)
    vec3 normal = normalize(currentPos);
    vec3 displaced = currentPos + normal * noise * noiseAmp * uProgress;

    // Mouse parallax - subtle rotation offset
    float mouseInfluence = 0.15;
    mat3 rotY = mat3(
      cos(uMouse.x * mouseInfluence), 0.0, sin(uMouse.x * mouseInfluence),
      0.0, 1.0, 0.0,
      -sin(uMouse.x * mouseInfluence), 0.0, cos(uMouse.x * mouseInfluence)
    );
    mat3 rotX = mat3(
      1.0, 0.0, 0.0,
      0.0, cos(uMouse.y * mouseInfluence), -sin(uMouse.y * mouseInfluence),
      0.0, sin(uMouse.y * mouseInfluence), cos(uMouse.y * mouseInfluence)
    );

    vec3 finalPos = rotX * rotY * displaced;

    // Calculate spherical UV for world map sampling
    vec3 sphereNormal = normalize(position);
    float longitude = atan(sphereNormal.x, sphereNormal.z);
    float latitude = asin(sphereNormal.y);
    vUV = vec2(
      (longitude / 6.28318) + 0.5,
      (latitude / 3.14159) + 0.5
    );

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Depth for fading - normalized based on camera distance
    float depth = -mvPosition.z;
    vDepth = smoothstep(1.5, 3.5, depth);

    // Point size with proper perspective attenuation
    // Scale factor accounts for camera distance and desired visual size
    float perspectiveScale = 1.0 / depth;
    float baseSize = uPointSize * uPixelRatio;
    float sizeVariation = 0.9 + noise * 0.15;

    gl_PointSize = baseSize * perspectiveScale * 45.0 * sizeVariation * uProgress;

    // Clamp to smaller size for more whitespace
    gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform sampler2D uWorldMap;

  varying float vDepth;
  varying float vNoise;
  varying vec2 vUV;

  void main() {
    // Circular point with soft falloff
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    // Hard circular mask with soft antialiased edge
    float circle = 1.0 - smoothstep(0.4, 0.5, dist);

    if (circle < 0.01) discard;

    // Sample world map texture to determine land vs ocean
    float landValue = texture2D(uWorldMap, vUV).r;
    bool isLand = landValue > 0.5;

    // Design system colors
    // Foreground: #fafafa -> vec3(0.98, 0.98, 0.98)
    // Accent cyan: #9de3f1 -> vec3(0.616, 0.890, 0.945)
    // Muted: #a1a1a1 -> vec3(0.631, 0.631, 0.631)

    vec3 foregroundColor = vec3(0.98, 0.98, 0.98);
    vec3 accentColor = vec3(0.616, 0.890, 0.945);
    vec3 mutedColor = vec3(0.631, 0.631, 0.631);
    vec3 oceanColor = vec3(0.2, 0.2, 0.25);

    // Land: bright accent cyan, Ocean: dark muted
    vec3 color;
    float baseAlpha;

    if (isLand) {
      // Land dots: bright cyan with some variation
      float colorMix = smoothstep(-0.3, 0.6, vNoise);
      color = mix(foregroundColor, accentColor, 0.6 + colorMix * 0.3);
      baseAlpha = 0.9;
    } else {
      // Ocean dots: dark and subtle
      color = oceanColor;
      baseAlpha = 0.25;
    }

    // Slight muted variation for depth
    color = mix(color, mutedColor, vDepth * 0.2);

    // Depth-based alpha fading - back points more transparent
    float depthFade = 1.0 - vDepth * 0.65;

    // Core opacity - solid center, softer edges
    float coreAlpha = smoothstep(0.5, 0.0, dist);

    // Combine alpha factors
    float alpha = circle * depthFade * baseAlpha * (0.6 + coreAlpha * 0.4) * uProgress;

    gl_FragColor = vec4(color, alpha);
  }
`

// =============================================================================
// Geometry Generation
// =============================================================================

function generateFibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3)
  const randoms = new Float32Array(count * 3)

  const goldenRatio = (1 + Math.sqrt(5)) / 2
  const angleIncrement = Math.PI * 2 * goldenRatio

  for (let i = 0; i < count; i++) {
    // Fibonacci sphere distribution
    const t = i / count
    const inclination = Math.acos(1 - 2 * t)
    const azimuth = angleIncrement * i

    const x = Math.sin(inclination) * Math.cos(azimuth) * radius
    const y = Math.sin(inclination) * Math.sin(azimuth) * radius
    const z = Math.cos(inclination) * radius

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    // Random offsets for scatter animation (seeded by index for consistency)
    const seed = i * 1.618033988749
    randoms[i * 3] = (Math.sin(seed) * 2 - 1)
    randoms[i * 3 + 1] = (Math.cos(seed * 1.3) * 2 - 1)
    randoms[i * 3 + 2] = (Math.sin(seed * 2.1) * 2 - 1)
  }

  return { positions, randoms }
}

// =============================================================================
// Point Cloud Component
// =============================================================================

interface PointCloudProps {
  pointCount?: number
  radius?: number
  pointSize?: number
  rotationSpeed?: number
}

function PointCloud({
  pointCount = 4000,
  radius = 1.0,
  pointSize = 1.5,
  rotationSpeed = 0.06,
}: PointCloudProps) {
  const meshRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const { size } = useThree()

  // Progress for scatter-to-sphere animation
  const [progress, setProgress] = useState(0)

  // Mouse position (normalized -1 to 1)
  const mouse = useRef({ x: 0, y: 0 })
  const targetMouse = useRef({ x: 0, y: 0 })

  // Generate geometry once
  const { positions, randoms } = useMemo(
    () => generateFibonacciSphere(pointCount, radius),
    [pointCount, radius]
  )

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3))
    return geo
  }, [positions, randoms])

  // Generate world map texture once
  const worldMapTexture = useMemo(() => generateWorldMapTexture(), [])

  // Uniforms
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointSize: { value: pointSize },
      uProgress: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uWorldMap: { value: worldMapTexture },
    }),
    [pointSize, worldMapTexture]
  )

  // Animate progress on mount
  useEffect(() => {
    const startTime = performance.now()
    const duration = 2000 // 2 seconds

    const animate = () => {
      const elapsed = performance.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setProgress(eased)

      if (t < 1) {
        requestAnimationFrame(animate)
      }
    }

    // Small delay before starting
    const timeout = setTimeout(() => {
      requestAnimationFrame(animate)
    }, 300)

    return () => clearTimeout(timeout)
  }, [])

  // Mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      targetMouse.current.x = (e.clientX / size.width) * 2 - 1
      targetMouse.current.y = -(e.clientY / size.height) * 2 + 1
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [size])

  // Animation loop
  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return

    // Update time
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime

    // Update progress
    materialRef.current.uniforms.uProgress.value = progress

    // Smooth mouse interpolation
    mouse.current.x += (targetMouse.current.x - mouse.current.x) * 0.05
    mouse.current.y += (targetMouse.current.y - mouse.current.y) * 0.05
    materialRef.current.uniforms.uMouse.value.set(mouse.current.x, mouse.current.y)

    // Continuous slow rotation
    meshRef.current.rotation.y += delta * rotationSpeed
  })

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={true}
      />
    </points>
  )
}

// =============================================================================
// Marble Hands Component (Atlas-style)
// =============================================================================

interface MarbleHandsProps {
  scale?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
}

function MarbleHands({
  scale = 1.0,
  position = [0, -1.1, 0],
  rotation = [0, 0, 0]
}: MarbleHandsProps) {
  const { scene } = useGLTF('/models/hands.glb')
  const groupRef = useRef<THREE.Group>(null)

  // Clone the scene to avoid issues with multiple instances
  const clonedScene = useMemo(() => {
    const clone = scene.clone()

    // Apply marble-like material properties for Three.js rendering
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Create a new material optimized for web rendering
        const marbleMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0.95, 0.93, 0.90),
          roughness: 0.2,
          metalness: 0.0,
          envMapIntensity: 0.8,
        })
        child.material = marbleMaterial
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    return clone
  }, [scene])

  return (
    <group ref={groupRef} position={position} scale={scale} rotation={rotation}>
      <primitive object={clonedScene} />
    </group>
  )
}

// Preload the model
useGLTF.preload('/models/hands.glb')

// =============================================================================
// Main Component
// =============================================================================

interface DotSphereProps {
  className?: string
  pointCount?: number
  radius?: number
  pointSize?: number
  rotationSpeed?: number
  showHands?: boolean
}

export function DotSphere({
  className = '',
  pointCount = 4000,
  radius = 1.0,
  pointSize = 1.5,
  rotationSpeed = 0.06,
  showHands = false,
}: DotSphereProps) {
  return (
    <div className={`w-full h-full min-h-[400px] ${className}`}>
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        camera={{
          position: showHands ? [0, 0.2, 3.2] : [0, 0, 2.5],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
      >
        {/* Lighting for marble hands */}
        {showHands && (
          <>
            <ambientLight intensity={0.4} />
            <directionalLight
              position={[5, 5, 5]}
              intensity={1.0}
              color="#ffffff"
            />
            <directionalLight
              position={[-3, 2, 4]}
              intensity={0.5}
              color="#9de3f1"
            />
          </>
        )}

        <PointCloud
          pointCount={pointCount}
          radius={radius}
          pointSize={pointSize}
          rotationSpeed={rotationSpeed}
        />

        {/* Atlas-style marble hands holding the globe */}
        {showHands && (
          <MarbleHands
            scale={0.8}
            position={[0, -0.85, 0.1]}
            rotation={[Math.PI * 0.1, 0, 0]}
          />
        )}
      </Canvas>
    </div>
  )
}
