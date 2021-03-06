import { MathUtil, Matrix, Matrix3x3, Quaternion, Vector3 } from "@oasis-engine/math";
import { assignmentClone, deepClone, ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { UpdateFlag } from "./UpdateFlag";

/**
 * Used to implement transformation related functions.
 */
export class Transform extends Component {
  private static _tempQuat0: Quaternion = new Quaternion();
  private static _tempVec3: Vector3 = new Vector3();
  private static _tempMat30: Matrix3x3 = new Matrix3x3();
  private static _tempMat31: Matrix3x3 = new Matrix3x3();
  private static _tempMat32: Matrix3x3 = new Matrix3x3();
  private static _tempMat40: Matrix = new Matrix();
  private static _tempMat41: Matrix = new Matrix();
  private static _tempMat42: Matrix = new Matrix();
  private static _tempMat43: Matrix = new Matrix();

  private static _LOCAL_EULER_FLAG: number = 0x1;
  private static _LOCAL_QUAT_FLAG: number = 0x2;
  private static _WORLD_POSITION_FLAG: number = 0x4;
  private static _WORLD_EULER_FLAG: number = 0x8;
  private static _WORLD_QUAT_FLAG: number = 0x10;
  private static _WORLD_SCALE_FLAG: number = 0x20;
  private static _LOCAL_MATRIX_FLAG: number = 0x40;
  private static _WORLD_MATRIX_FLAG: number = 0x80;

  /** _WORLD_MATRIX_FLAG | _WORLD_POSITION_FLAG */
  private static _WM_WP_FLAGS: number = 0x84;
  /** _WORLD_MATRIX_FLAG | _WORLD_EULER_FLAG | _WORLD_QUAT_FLAG */
  private static _WM_WE_WQ_FLAGS: number = 0x98;
  /** _WORLD_MATRIX_FLAG | _WORLD_POSITION_FLAG | _WORLD_EULER_FLAG | _WORLD_QUAT_FLAG */
  private static _WM_WP_WE_WQ_FLAGS: number = 0x9c;
  /** Transform._WORLD_MATRIX_FLAG | Transform._WORLD_SCALE_FLAG */
  private static _WM_WS_FLAGS: number = 0xa0;
  /** Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_SCALE_FLAG */
  private static _WM_WP_WS_FLAGS: number = 0xa4;
  /** Transform._WORLD_MATRIX_FLAG | Transform._WORLD_POSITION_FLAG | Transform._WORLD_EULER_FLAG | Transform._WORLD_QUAT_FLAG | Transform._WORLD_SCALE_FLAG */
  private static _WM_WP_WE_WQ_WS_FLAGS: number = 0xbc;

  @deepClone
  private _position: Vector3 = new Vector3();
  @deepClone
  private _rotation: Vector3 = new Vector3();
  @deepClone
  private _rotationQuaternion: Quaternion = new Quaternion();
  @deepClone
  private _scale: Vector3 = new Vector3(1, 1, 1);
  @deepClone
  private _worldPosition: Vector3 = new Vector3();
  @deepClone
  private _worldRotation: Vector3 = new Vector3();
  @deepClone
  private _worldRotationQuaternion: Quaternion = new Quaternion();
  @deepClone
  private _lossyWorldScale: Vector3 = new Vector3(1, 1, 1);
  @deepClone
  private _localMatrix: Matrix = new Matrix();
  @deepClone
  private _worldMatrix: Matrix = new Matrix();
  @ignoreClone
  private _changeFlags: UpdateFlag[] = [];
  @ignoreClone
  private _isParentDirty: boolean = true;
  @ignoreClone
  private _parentTransformCache: Transform = null;

  private _dirtyFlag: number = Transform._WM_WP_WE_WQ_WS_FLAGS;

  /**
   * Local position.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    if (this._position !== value) {
      value.cloneTo(this._position);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG);
    this._updateWorldPositionFlag();
  }

  /**
   * World position.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldPosition(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_POSITION_FLAG)) {
      if (this._getParentTransform()) {
        this.worldMatrix.getTranslation(this._worldPosition);
      } else {
        this._position.cloneTo(this._worldPosition);
      }
      this._setDirtyFlagFalse(Transform._WORLD_POSITION_FLAG);
    }
    return this._worldPosition;
  }

  set worldPosition(value: Vector3) {
    if (this._worldPosition !== value) {
      value.cloneTo(this._worldPosition);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, Transform._tempMat41);
      Vector3.transformCoordinate(value, Transform._tempMat41, this._position);
    } else {
      value.cloneTo(this._position);
    }
    this.position = this._position;
    this._setDirtyFlagFalse(Transform._WORLD_POSITION_FLAG);
  }

  /**
   * Local rotation, defining the rotation value in degrees, Yaw/Pitch/Roll sequence.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get rotation(): Vector3 {
    if (this._isContainDirtyFlag(Transform._LOCAL_EULER_FLAG)) {
      this._rotationQuaternion.toEuler(this._rotation);
      this._rotation.scale(MathUtil.radToDegreeFactor); // radians to degrees

      this._setDirtyFlagFalse(Transform._LOCAL_EULER_FLAG);
    }
    return this._rotation;
  }

  set rotation(value: Vector3) {
    if (this._rotation !== value) {
      value.cloneTo(this._rotation);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_QUAT_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_EULER_FLAG);
    this._updateWorldRotationFlag();
  }

  /**
   * World rotation, defining the rotation value in degrees, Yaw/Pitch/Roll sequence.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldRotation(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_EULER_FLAG)) {
      this.worldRotationQuaternion.toEuler(this._worldRotation);
      this._worldRotation.scale(MathUtil.radToDegreeFactor); // Radian to angle
      this._setDirtyFlagFalse(Transform._WORLD_EULER_FLAG);
    }
    return this._worldRotation;
  }

  set worldRotation(value: Vector3) {
    if (this._worldRotation !== value) {
      value.cloneTo(this._worldRotation);
    }
    Quaternion.rotationEuler(
      MathUtil.degreeToRadian(value.x),
      MathUtil.degreeToRadian(value.y),
      MathUtil.degreeToRadian(value.z),
      this._worldRotationQuaternion
    );
    this.worldRotationQuaternion = this._worldRotationQuaternion;
    this._setDirtyFlagFalse(Transform._WORLD_EULER_FLAG);
  }

  /**
   * Local rotaion, defining the rotation by using a unit quaternion.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get rotationQuaternion(): Quaternion {
    if (this._isContainDirtyFlag(Transform._LOCAL_QUAT_FLAG)) {
      Quaternion.rotationEuler(
        MathUtil.degreeToRadian(this._rotation.x),
        MathUtil.degreeToRadian(this._rotation.y),
        MathUtil.degreeToRadian(this._rotation.z),
        this._rotationQuaternion
      );
      this._setDirtyFlagFalse(Transform._LOCAL_QUAT_FLAG);
    }
    return this._rotationQuaternion;
  }

  set rotationQuaternion(value: Quaternion) {
    if (this._rotationQuaternion !== value) {
      value.cloneTo(this._rotationQuaternion);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG | Transform._LOCAL_EULER_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_QUAT_FLAG);
    this._updateWorldRotationFlag();
  }

  /**
   * World rotaion, defining the rotation by using a unit quaternion.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldRotationQuaternion(): Quaternion {
    if (this._isContainDirtyFlag(Transform._WORLD_QUAT_FLAG)) {
      const parent = this._getParentTransform();
      if (parent != null) {
        Quaternion.multiply(parent.worldRotationQuaternion, this.rotationQuaternion, this._worldRotationQuaternion);
      } else {
        this.rotationQuaternion.cloneTo(this._worldRotationQuaternion);
      }
      this._setDirtyFlagFalse(Transform._WORLD_QUAT_FLAG);
    }
    return this._worldRotationQuaternion;
  }

  set worldRotationQuaternion(value: Quaternion) {
    if (this._worldRotationQuaternion !== value) {
      value.cloneTo(this._worldRotationQuaternion);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Quaternion.invert(parent.worldRotationQuaternion, Transform._tempQuat0);
      Quaternion.multiply(value, Transform._tempQuat0, this._rotationQuaternion);
    } else {
      value.cloneTo(this._rotationQuaternion);
    }
    this.rotationQuaternion = this._rotationQuaternion;
    this._setDirtyFlagFalse(Transform._WORLD_QUAT_FLAG);
  }

  /**
   * Local scaling.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get scale(): Vector3 {
    return this._scale;
  }

  set scale(value: Vector3) {
    if (this._scale !== value) {
      value.cloneTo(this._scale);
    }
    this._setDirtyFlagTrue(Transform._LOCAL_MATRIX_FLAG);
    this._updateWorldScaleFlag();
  }

  /**
   * Local lossy scaling.
   * @remarks The value obtained may not be correct under certain conditions(for example, the parent node has scaling, and the child node has a rotation), the scaling will be tilted. Vector3 cannot be used to correctly represent the scaling. Must use Matrix3x3.
   */
  get lossyWorldScale(): Vector3 {
    if (this._isContainDirtyFlag(Transform._WORLD_SCALE_FLAG)) {
      if (this._getParentTransform()) {
        const scaleMat = this._getScaleMatrix();
        const e = scaleMat.elements;
        this._lossyWorldScale.setValue(e[0], e[4], e[8]);
      } else {
        this._scale.cloneTo(this._lossyWorldScale);
      }
      this._setDirtyFlagFalse(Transform._WORLD_SCALE_FLAG);
    }
    return this._lossyWorldScale;
  }

  /**
   * Local matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get localMatrix(): Matrix {
    if (this._isContainDirtyFlag(Transform._LOCAL_MATRIX_FLAG)) {
      Matrix.affineTransformation(this._scale, this.rotationQuaternion, this._position, this._localMatrix);
      this._setDirtyFlagFalse(Transform._LOCAL_MATRIX_FLAG);
    }
    return this._localMatrix;
  }

  set localMatrix(value: Matrix) {
    if (this._localMatrix !== value) {
      value.cloneTo(this._localMatrix);
    }
    this._localMatrix.decompose(this._position, this._rotationQuaternion, this._scale);
    this._setDirtyFlagTrue(Transform._LOCAL_EULER_FLAG);
    this._setDirtyFlagFalse(Transform._LOCAL_MATRIX_FLAG);
    this._updateAllWorldFlag();
  }

  /**
   * World matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get worldMatrix(): Matrix {
    if (this._isContainDirtyFlag(Transform._WORLD_MATRIX_FLAG)) {
      const parent = this._getParentTransform();
      if (parent) {
        Matrix.multiply(parent.worldMatrix, this.localMatrix, this._worldMatrix);
      } else {
        this.localMatrix.cloneTo(this._worldMatrix);
      }
      this._setDirtyFlagFalse(Transform._WORLD_MATRIX_FLAG);
    }
    return this._worldMatrix;
  }

  set worldMatrix(value: Matrix) {
    if (this._worldMatrix !== value) {
      value.cloneTo(this._worldMatrix);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, Transform._tempMat42);
      Matrix.multiply(value, Transform._tempMat42, this._localMatrix);
    } else {
      value.cloneTo(this._localMatrix);
    }
    this.localMatrix = this._localMatrix;
    this._setDirtyFlagFalse(Transform._WORLD_MATRIX_FLAG);
  }

  /**
   * Set local position by X, Y, Z value.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setPosition(x: number, y: number, z: number): void {
    this._position.setValue(x, y, z);
    this.position = this._position;
  }

  /**
   * Set local rotaion by the X, Y, Z components of the euler angle, unit in degrees, Yaw/Pitch/Roll sequence.
   * @param x - The angle of rotation around the X axis
   * @param y - The angle of rotation around the Y axis
   * @param z - The angle of rotation around the Z axis
   */
  setRotation(x: number, y: number, z: number): void {
    this._rotation.setValue(x, y, z);
    this.rotation = this._rotation;
  }

  /**
   * Set local rotaion by the X, Y, Z, and W components of the quaternion.
   * @param x - X component of quaternion
   * @param y - Y component of quaternion
   * @param z - Z component of quaternion
   * @param w - W component of quaternion
   */
  setRotationQuaternion(x: number, y: number, z: number, w: number): void {
    this._rotationQuaternion.setValue(x, y, z, w);
    this.rotationQuaternion = this._rotationQuaternion;
  }

  /**
   * Set local scaling by scaling values along X, Y, Z axis.
   * @param x - Scaling along X axis
   * @param y - Scaling along Y axis
   * @param z - Scaling along Z axis
   */
  setScale(x: number, y: number, z: number): void {
    this._scale.setValue(x, y, z);
    this.scale = this._scale;
  }

  /**
   * Set world position by X, Y, Z value.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setWorldPosition(x: number, y: number, z: number): void {
    this._worldPosition.setValue(x, y, z);
    this.worldPosition = this._worldPosition;
  }

  /**
   * Set world rotaion by the X, Y, Z components of the euler angle, unit in degrees, Yaw/Pitch/Roll sequence.
   * @param x - The angle of rotation around the X axis
   * @param y - The angle of rotation around the Y axis
   * @param z - The angle of rotation around the Z axis
   */
  setWorldRotation(x: number, y: number, z: number): void {
    this._worldRotation.setValue(x, y, z);
    this.worldRotation = this._worldRotation;
  }

  /**
   * Set local rotaion by the X, Y, Z, and W components of the quaternion.
   * @param x - X component of quaternion
   * @param y - Y component of quaternion
   * @param z - Z component of quaternion
   * @param w - W component of quaternion
   */
  setWorldRotationQuaternion(x: number, y: number, z: number, w: number): void {
    this._worldRotationQuaternion.setValue(x, y, z, w);
    this.worldRotationQuaternion = this._worldRotationQuaternion;
  }

  /**
   * Get the forward direction in world space.
   * @param forward - Forward vector
   * @returns Forward vector
   */
  getWorldForward(forward: Vector3): Vector3 {
    const e = this.worldMatrix.elements;
    forward.setValue(-e[8], -e[9], -e[10]);
    return forward.normalize();
  }

  /**
   * Get the right direction in world space.
   * @param right - Right vector
   * @returns Right vector
   */
  getWorldRight(right: Vector3): Vector3 {
    const e = this.worldMatrix.elements;
    right.setValue(e[0], e[1], e[2]);
    return right.normalize();
  }

  /**
   * Get the up direction in world space.
   * @param up - Up vector
   * @returns Up vector
   */
  getWorldUp(up: Vector3): Vector3 {
    const e = this.worldMatrix.elements;
    up.setValue(e[4], e[5], e[6]);
    return up.normalize();
  }

  /**
   * Translate along the passed Vector3.
   * @param translation - Direction and distance of translation
   * @param relativeToLocal - Relative to local space
   */
  translate(translation: Vector3, relativeToLocal?: boolean): void;

  /**
   * Translate along the passed X, Y, Z value.
   * @param x - Translate direction and distance along x axis
   * @param y - Translate direction and distance along y axis
   * @param z - Translate direction and distance along z axis
   * @param relativeToLocal - Relative to local space
   */
  translate(x: number, y: number, z: number, relativeToLocal?: boolean): void;

  translate(
    translationOrX: Vector3 | number,
    relativeToLocalOrY?: boolean | number,
    z?: number,
    relativeToLocal?: boolean
  ): void {
    if (typeof translationOrX === "number") {
      const translate = Transform._tempVec3;
      translate.setValue(translationOrX, <number>relativeToLocalOrY, z);
      this._translate(translate, relativeToLocal);
    } else {
      this._translate(translationOrX, <boolean>relativeToLocalOrY);
    }
  }

  /**
   * Rotate around the passed Vector3.
   * @param rotation - Euler angle in degrees
   * @param relativeToLocal - Relative to local space
   */
  rotate(rotation: Vector3, relativeToLocal?: boolean): void;

  /**
   * Rotate around the passed Vector3.
   * @param x - Rotation along x axis, in degrees
   * @param y - Rotation along y axis, in degrees
   * @param z - Rotation along z axis, in degrees
   * @param relativeToLocal - Relative to local space
   */
  rotate(x: number, y: number, z: number, relativeToLocal?: boolean): void;

  rotate(
    rotationOrX: Vector3 | number,
    relativeToLocalOrY?: boolean | number,
    z?: number,
    relativeToLocal?: boolean
  ): void {
    if (typeof rotationOrX === "number") {
      this._rotateXYZ(rotationOrX, <number>relativeToLocalOrY, z, relativeToLocal);
    } else {
      this._rotateXYZ(rotationOrX.x, rotationOrX.y, rotationOrX.z, <boolean>relativeToLocalOrY);
    }
  }

  /**
   * Rotate around the specified axis according to the specified angle.
   * @param axis - Rotate axis
   * @param angle - Rotate angle in degrees
   * @param relativeToLocal - Relative to local space
   */
  rotateByAxis(axis: Vector3, angle: number, relativeToLocal: boolean = true): void {
    const rad = angle * MathUtil.degreeToRadFactor;
    Quaternion.rotationAxisAngle(axis, rad, Transform._tempQuat0);
    this._rotateByQuat(Transform._tempQuat0, relativeToLocal);
  }

  /**
   * Rotate and ensure that the world front vector points to the target world position.
   * @param worldPosition - Target world position
   * @param worldUp - Up direciton in world space, defalut is Vector3(0, 1, 0)
   */
  lookAt(worldPosition: Vector3, worldUp?: Vector3): void {
    const position = this.worldPosition;
    const EPSILON = MathUtil.zeroTolerance;
    if (
      Math.abs(position.x - worldPosition.x) < EPSILON &&
      Math.abs(position.y - worldPosition.y) < EPSILON &&
      Math.abs(position.z - worldPosition.z) < EPSILON
    ) {
      return;
    }
    const rotMat = Transform._tempMat43;
    const worldRotationQuaternion = this._worldRotationQuaternion;

    worldUp = worldUp ?? Transform._tempVec3.setValue(0, 1, 0);
    Matrix.lookAt(position, worldPosition, worldUp, rotMat);
    rotMat.getRotation(worldRotationQuaternion).invert();
    this.worldRotationQuaternion = worldRotationQuaternion;
  }

  /**
   * Register world transform change flag.
   * @returns Change flag
   */
  registerWorldChangeFlag(): UpdateFlag {
    const flag = new UpdateFlag(this._changeFlags);
    this._changeFlags.push(flag);
    return flag;
  }

  /**
   * @internal
   */
  _parentChange(): void {
    this._isParentDirty = true;
    this._updateAllWorldFlag();
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldPositionFlag(): void {
    if (!this._isContainDirtyFlags(Transform._WM_WP_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionFlag();
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldRotationQuaternion: Will trigger the world rotation (in quaternion) update of itself and all parent entities.
   * Get worldRotation: Will trigger the world rotation(in euler and quaternion) update of itself and world rotation(in quaternion) update of all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldRotationFlag() {
    if (!this._isContainDirtyFlags(Transform._WM_WE_WQ_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WE_WQ_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndRotationFlag(); // Rotation update of parent entity will trigger world position and rotation update of all child entity.
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldRotationQuaternion: Will trigger the world rotation (in quaternion) update of itself and all parent entities.
   * Get worldRotation: Will trigger the world rotation(in euler and quaternion) update of itself and world rotation(in quaternion) update of all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix or worldRotationQuaternion) to be false.
   */
  private _updateWorldPositionAndRotationFlag() {
    if (!this._isContainDirtyFlags(Transform._WM_WP_WE_WQ_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_WE_WQ_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndRotationFlag();
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix) to be false.
   */
  private _updateWorldScaleFlag() {
    if (!this._isContainDirtyFlags(Transform._WM_WS_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WS_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndScaleFlag();
      }
    }
  }

  /**
   * Get worldMatrix: Will trigger the worldMatrix update of itself and all parent entities.
   * Get worldPosition: Will trigger the worldMatrix, local position update of itself and the worldMatrix update of all parent entities.
   * Get worldScale: Will trigger the scaling update of itself and all parent entities.
   * In summary, any update of related variables will cause the dirty mark of one of the full process (worldMatrix) to be false.
   */
  private _updateWorldPositionAndScaleFlag(): void {
    if (!this._isContainDirtyFlags(Transform._WM_WP_WS_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_WS_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateWorldPositionAndScaleFlag();
      }
    }
  }

  /**
   * Update all world transform property dirty flag, the principle is the same as above.
   */
  private _updateAllWorldFlag(): void {
    if (!this._isContainDirtyFlags(Transform._WM_WP_WE_WQ_WS_FLAGS)) {
      this._worldAssociatedChange(Transform._WM_WP_WE_WQ_WS_FLAGS);
      const nodeChildren = this._entity._children;
      for (let i: number = 0, n: number = nodeChildren.length; i < n; i++) {
        nodeChildren[i].transform?._updateAllWorldFlag();
      }
    }
  }

  private _getParentTransform(): Transform | null {
    if (!this._isParentDirty) {
      return this._parentTransformCache;
    }
    let parentCache: Transform = null;
    let parent = this._entity.parent;
    while (parent) {
      const transform = parent.transform;
      if (transform) {
        parentCache = transform;
        break;
      } else {
        parent = parent.parent;
      }
    }
    this._parentTransformCache = parentCache;
    this._isParentDirty = false;
    return parentCache;
  }

  private _getScaleMatrix(): Matrix3x3 {
    const invRotation = Transform._tempQuat0;
    const invRotationMat = Transform._tempMat30;
    const worldRotScaMat = Transform._tempMat31;
    const scaMat = Transform._tempMat32;
    worldRotScaMat.setValueByMatrix(this.worldMatrix);
    Quaternion.invert(this.worldRotationQuaternion, invRotation);
    Matrix3x3.rotationQuaternion(invRotation, invRotationMat);
    Matrix3x3.multiply(invRotationMat, worldRotScaMat, scaMat);
    return scaMat;
  }

  private _isContainDirtyFlags(targetDirtyFlags: number): boolean {
    return (this._dirtyFlag & targetDirtyFlags) === targetDirtyFlags;
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number) {
    this._dirtyFlag |= type;
  }

  private _setDirtyFlagFalse(type: number) {
    this._dirtyFlag &= ~type;
  }

  private _worldAssociatedChange(type: number): void {
    this._dirtyFlag |= type;
    const len = this._changeFlags.length;
    for (let i = len - 1; i >= 0; i--) {
      this._changeFlags[i].flag = true;
    }
  }

  private _rotateByQuat(rotateQuat: Quaternion, relativeToLocal: boolean) {
    if (relativeToLocal) {
      Quaternion.multiply(this.rotationQuaternion, rotateQuat, this._rotationQuaternion);
      this.rotationQuaternion = this._rotationQuaternion;
    } else {
      Quaternion.multiply(this.worldRotationQuaternion, rotateQuat, this._worldRotationQuaternion);
      this.worldRotationQuaternion = this._worldRotationQuaternion;
    }
  }

  private _translate(translation: Vector3, relativeToLocal: boolean = true): void {
    if (relativeToLocal) {
      const rotationMat = Transform._tempMat40;
      Matrix.rotationQuaternion(this.rotationQuaternion, rotationMat);
      Vector3.transformCoordinate(translation, rotationMat, Transform._tempVec3);
      this.position = this._position.add(Transform._tempVec3);
    } else {
      this.worldPosition = this._worldPosition.add(translation);
    }
  }

  private _rotateXYZ(x: number, y: number, z: number, relativeToLocal: boolean = true): void {
    const radFactor = MathUtil.degreeToRadFactor;
    const rotQuat = Transform._tempQuat0;
    Quaternion.rotationEuler(x * radFactor, y * radFactor, z * radFactor, rotQuat);
    this._rotateByQuat(rotQuat, relativeToLocal);
  }

  /**
   * @deprecated Please use translate() function instead.
   * Translate in the specified direction and distance.
   * @param x - The direction and distance of translation in x axis
   * @param y - The direction and distance of translation in y axis
   * @param z - The direction and distance of translation in z axis
   * @param relativeToLocal - Whether relative local space
   */
  translateXYZ(x: number, y: number, z: number, relativeToLocal: boolean = true): void {
    this.translate(x, y, z, relativeToLocal);
  }

  /**
   * @deprecated please use rotate() function instead.
   * Rotate according to the specified Euler angle.
   * @param x - The angle that rotate around of x axis (uint: angle)
   * @param y - The angle that rotate around of y axis (uint: angle)
   * @param z - The angle that rotate around of z axis (uint: angle)
   * @param relativeToLocal - Whether relative local space
   */
  rotateXYZ(x: number, y: number, z: number, relativeToLocal: boolean = true): void {
    this.rotate(x, y, z, relativeToLocal);
  }
}
