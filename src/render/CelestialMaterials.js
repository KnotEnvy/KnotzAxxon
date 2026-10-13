import * as THREE from 'three';

// Both bodies stay in the existing two draws. Surface detail is procedural,
// continuous across the sphere seam, and needs no downloaded texture assets.
export function planetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOcean: { value: new THREE.Color(0x173956) },
      uLand: { value: new THREE.Color(0x557b87) },
      uAir: { value: new THREE.Color(0x65b7da) },
      uSun: { value: new THREE.Vector3(-0.5, 0.6, -0.6).normalize() },
    },
    vertexShader: /* glsl */`
      varying vec3 vSurface;
      varying vec3 vNormalW;
      varying vec3 vNormalV;
      varying vec3 vView;
      void main() {
        vSurface = position;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vNormalV = normalMatrix * normal;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uOcean, uLand, uAir, uSun;
      varying vec3 vSurface, vNormalW, vNormalV, vView;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float terrain(vec3 p) {
        return noise(p)*0.57 + noise(p*2.03)*0.28 + noise(p*4.11)*0.15;
      }
      void main() {
        vec3 p = normalize(vSurface);
        float n = terrain(p*3.8+3.0);
        float land = smoothstep(0.46,0.59,n);
        vec3 surface = mix(uOcean, uLand*(0.7+n*0.6), land);
        float clouds = smoothstep(0.52,0.76,terrain(p*8.0+vec3(n*2.0,p.y*2.0,7)));
        float ice = smoothstep(0.82,0.97,abs(p.y)+n*0.08);
        surface = mix(surface, vec3(0.38,0.46,0.52), max(clouds*0.65,ice*0.8));
        float sunlight = dot(normalize(vNormalW), normalize(uSun));
        float day = smoothstep(-0.18,0.65,sunlight);
        vec3 col = surface*(0.12+day*0.9);
        vec3 viewDir = isOrthographic ? vec3(0,0,1) : normalize(vView);
        float limb = pow(1.0-max(dot(normalize(vNormalV),viewDir),0.0),3.8);
        col += uAir*limb*(0.10+0.65*day);
        gl_FragColor = vec4(col,1.0);
      }
    `,
  });
}

export function planetRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x9ea8bc) } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vRing;
      void main() { vRing = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vRing;
      void main() {
        float r = length(vRing);
        float bands = 0.58 + 0.18*sin(r*118.0) + 0.12*sin(r*271.0);
        float gap = 1.0-smoothstep(0.012,0.025,abs(r-1.91));
        float edge = smoothstep(1.45,1.50,r)*(1.0-smoothstep(2.24,2.30,r));
        float a = edge*bands*(1.0-gap*0.94)*0.62;
        gl_FragColor = vec4(uColor*(0.65+bands*0.4),a);
      }
    `,
  });
}
