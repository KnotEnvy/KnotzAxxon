// Adapted from the frozen cooling-stack initial streaming prototype.
const BREATHE = 3;

export function prepareCoolingStack(data) {
  if (data.schema !== 'cooling-stack-parametric-v1' || data.restHeight !== 9) throw new Error('Unsupported cooling template');
  let positions = new Float32Array(data.positions);
  let heightWeights = new Float32Array(data.heightWeights);
  let colors = new Float32Array(data.linearColors);
  let triangleBuckets = new Uint8Array(data.triangleBuckets);
  if (positions.length !== triangleBuckets.length * 9 || colors.length !== positions.length || heightWeights.length * 3 !== positions.length) throw new Error('Invalid cooling template lengths');
  let local = new Float64Array(9);
  let retained = true;

  function stamp(batch, height, phase, centerX, centerZ) {
    if (!retained) throw new Error('Cooling template released');
    if (height < 7 || height > 11) throw new Error('Source height outside 7..11');
    const targets = ['hull', 'dark', 'neon'].map(key => batch._bucket(key));
    const counts = [0, 0, 0];
    for (const bucketIndex of triangleBuckets) counts[bucketIndex] += 3;
    for (let index = 0; index < 3; index++) targets[index].reserve(counts[index]);
    const animation = { anim: [BREATHE, 0.4, phase] };
    const spans = targets.map(() => [Infinity, -Infinity]);
    for (let triangle = 0; triangle < triangleBuckets.length; triangle++) {
      const span = spans[triangleBuckets[triangle]];
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = triangle * 3 + corner;
        const posY = positions[vertexIndex * 3 + 1] + (height - 9) * heightWeights[vertexIndex];
        span[0] = Math.min(span[0], posY); span[1] = Math.max(span[1], posY);
      }
    }
    for (let triangle = 0; triangle < triangleBuckets.length; triangle++) {
      const bucketIndex = triangleBuckets[triangle], bucket = targets[bucketIndex];
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = triangle * 3 + corner;
        local[corner*3] = positions[vertexIndex*3];
        local[corner*3+1] = positions[vertexIndex*3+1] + (height-9)*heightWeights[vertexIndex];
        local[corner*3+2] = positions[vertexIndex*3+2];
      }
      const edgeAX = local[3]-local[0], edgeAY = local[4]-local[1], edgeAZ = local[5]-local[2];
      const edgeBX = local[6]-local[0], edgeBY = local[7]-local[1], edgeBZ = local[8]-local[2];
      let normalX = edgeAY*edgeBZ-edgeAZ*edgeBY, normalY = edgeAZ*edgeBX-edgeAX*edgeBZ, normalZ = edgeAX*edgeBY-edgeAY*edgeBX;
      const magnitude = Math.hypot(normalX,normalY,normalZ);
      if (!(magnitude > 0)) throw new Error('Degenerate cooling triangle');
      normalX /= magnitude; normalY /= magnitude; normalZ /= magnitude;
      const plane = Math.abs(normalX) >= Math.abs(normalY) && Math.abs(normalX) >= Math.abs(normalZ) ? 0 : Math.abs(normalY) >= Math.abs(normalZ) ? 1 : 2;
      const uvScale = [4,3,8][bucketIndex], span = spans[bucketIndex];
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = triangle*3+corner;
        const worldX = local[corner*3]+centerX, worldY = local[corner*3+1], worldZ = local[corner*3+2]+centerZ;
        let shade = 1;
        if (bucketIndex !== 2) {
          if (span[1]-span[0] > .6) shade = .58+.42*Math.sqrt(Math.max(0,worldY-span[0])/(span[1]-span[0]));
          if (normalY > .7) shade *= 1.1;
          if (normalZ < -.7) shade *= batch.frontLift;
          else if (Math.abs(normalX) > .7) shade *= batch.sideLift;
        }
        const gain = bucketIndex === 2 ? 1.2 : 1;
        batch._vertex(bucket,worldX,worldY,worldZ,normalX,normalY,normalZ,
          (plane === 0 ? worldZ : worldX)/uvScale,(plane === 1 ? worldZ : worldY)/uvScale,
          colors[vertexIndex*3]*gain,colors[vertexIndex*3+1]*gain,colors[vertexIndex*3+2]*gain,
          shade,bucketIndex === 2 ? animation : null,centerX,0,centerZ);
      }
    }
    if (batch.captureSurfaces) {
      for (let courseY = 1.5; courseY < height-1; courseY += 2.2) {
        const width = 4.2+(3-4.2)*(courseY/height)+.18;
        batch.surfaces.push({ minX:centerX-width/2,maxX:centerX+width/2,minZ:centerZ-width/2,maxZ:centerZ+width/2,top:courseY+.22 });
      }
      batch.surfaces.push({ minX:centerX-1.6,maxX:centerX+1.6,minZ:centerZ-1.6,maxZ:centerZ+1.6,top:height+.18 });
      batch.surfaces.push({ minX:centerX-1.35,maxX:centerX+1.35,minZ:centerZ-1.35,maxZ:centerZ+1.35,top:height+.19+.05 });
    }
  }

  function coolingStack(batch, rng, centerX, centerZ, emit) {
    const height = rng.range(7, 11);
    const phase = rng.next();
    stamp(batch,height,phase,centerX,centerZ);
    emit('steam',centerX,height+.4,centerZ,1);
  }

  return Object.freeze({ stamp, coolingStack, shutdown() { retained = false; positions = heightWeights = colors = triangleBuckets = local = null; } });
}

let loadedTemplate;
export async function loadImportedCoolingStack(base) {
  const response = await fetch(base + 'cooling-stack.template.json');
  if (!response.ok) throw new Error('Cooling template failed to load');
  loadedTemplate = prepareCoolingStack(await response.json());
}
export function appendImportedCoolingStack(batch, rng, x, z, emit) {
  if (!loadedTemplate) return false;
  loadedTemplate.coolingStack(batch, rng, x, z, emit);
  return true;
}
export function disposeImportedCoolingStack() {
  loadedTemplate?.shutdown();loadedTemplate = undefined;
}
