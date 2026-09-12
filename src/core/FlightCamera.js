import * as THREE from 'three';

/** Stable camera identity shared by renderer, particles and HUD across rig changes. */
export class FlightCamera extends THREE.PerspectiveCamera {
  setFlightProjection(classic, halfHeight = 44) {
    this.classic = classic;
    this.halfHeight = halfHeight;
    this.isOrthographicCamera = classic;
    this.isPerspectiveCamera = !classic;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    if (!this.classic) { super.updateProjectionMatrix(); return; }
    const h = this.halfHeight / this.zoom;
    this.top = h; this.bottom = -h;
    this.left = -h * this.aspect; this.right = h * this.aspect;
    this.projectionMatrix.makeOrthographic(this.left, this.right, this.top, this.bottom, this.near, this.far);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
