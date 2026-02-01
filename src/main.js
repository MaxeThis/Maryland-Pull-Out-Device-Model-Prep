/**
 * Maryland Pull-Out Device - Main Entry Point
 * Initializes the 3D scene, loads the rig template, and sets up UI interactions
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Evaluator, Brush, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { ViewCube } from './ViewCube.js';

// ============ Application State ============
const state = {
    currentStep: 1,
    isProcessed: false,
    userModel: null,
    rig: {
        screwMeshes: [], // Array of screw component meshes (Ant_*, L_*, R_*)
        baseTrim: null,
        fillerTransform: null,
        guide2mm: null,
        hooks: null,
        sampleModel: null
    },
    originalFillerPosition: new THREE.Vector3(),
    originalFillerScale: new THREE.Vector3(1, 1, 1),
    materials: {
        model: null,
        filler: null,
        guide: null,
        hooks: null,
        trimPreview: null
    }
};

// Default rotation offsets (Corrected: X=-90 keeps model upright and flips facing)
const MODEL_ROTATION_OFFSET = {
    x: THREE.MathUtils.degToRad(-90),
    y: 0,
    z: 0
};

// ============ Undo System ============
const undoHistory = [];
const MAX_UNDO_STEPS = 50;

function saveUndoState() {
    const snapshot = {
        modelPosition: state.userModel ? state.userModel.position.clone() : null,
        modelRotation: state.userModel ? state.userModel.rotation.clone() : null,
        fillerPosition: state.rig.fillerTransform ? state.rig.fillerTransform.position.clone() : null,
        fillerScale: state.rig.fillerTransform ? state.rig.fillerTransform.scale.clone() : null
    };

    console.log('[Undo] Saving state:', {
        position: snapshot.modelPosition ? snapshot.modelPosition.toArray() : null,
        rotation: snapshot.modelRotation ? snapshot.modelRotation.toArray().map(r => (r * 180 / Math.PI).toFixed(1) + '°') : null,
        historyLength: undoHistory.length + 1
    });

    undoHistory.push(snapshot);

    // Limit history size
    if (undoHistory.length > MAX_UNDO_STEPS) {
        undoHistory.shift();
    }
}

function undo() {
    if (undoHistory.length < 2) {
        updateInstruction('Nothing to undo.');
        return;
    }

    // Remove current state
    undoHistory.pop();

    // Get previous state
    const prevState = undoHistory[undoHistory.length - 1];

    console.log('[Undo] Restoring state:', prevState);

    if (prevState.modelPosition && state.userModel) {
        console.log('[Undo] Restoring model position:', prevState.modelPosition.toArray());
        console.log('[Undo] Restoring model rotation:', prevState.modelRotation.toArray().map(r => (r * 180 / Math.PI).toFixed(1) + '°'));

        state.userModel.position.copy(prevState.modelPosition);

        // Explicitly set each rotation component (Euler copy can sometimes fail)
        state.userModel.rotation.x = prevState.modelRotation.x;
        state.userModel.rotation.y = prevState.modelRotation.y;
        state.userModel.rotation.z = prevState.modelRotation.z;

        syncModelSlidersFromMesh();
    }

    if (prevState.fillerPosition && state.rig.fillerTransform) {
        state.rig.fillerTransform.position.copy(prevState.fillerPosition);
        state.rig.fillerTransform.scale.copy(prevState.fillerScale);
        syncFillerSlidersFromMesh();
    }

    updateInstruction('Undo successful.');
}

// ============ Three.js Setup ============
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Camera (Perspective for 3D navigation)
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(100, 100, 100);

// Orthographic camera for axis-aligned views (no FOV distortion)
const orthoSize = 120;
const orthoAspect = window.innerWidth / window.innerHeight;
const orthoCamera = new THREE.OrthographicCamera(
    -orthoSize * orthoAspect / 2,
    orthoSize * orthoAspect / 2,
    orthoSize / 2,
    -orthoSize / 2,
    0.1,
    500
);

// Track which camera is active
let activeCamera = camera;
let isOrthoView = false;

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 20;
controls.maxDistance = 200;
controls.target.set(0, 0, 0);

// Track if we're in a pole view (Top/Bottom) for rotation handling
let isInPoleView = false;

// Fix for Top/Bottom view rotation issue:
// Intercept mousedown BEFORE OrbitControls to handle the transition properly
canvas.addEventListener('mousedown', (event) => {
    // Only handle left-click (button 0) which is used for rotation
    if (event.button !== 0) return;

    // Check if we're in a Top/Bottom view (non-standard up vector)
    const upY = activeCamera.up.y;
    if (Math.abs(upY) < 0.1) {
        // We're in a Top or Bottom view - need to transition to perspective first
        console.log('[Camera] Clicked in Top/Bottom view, transitioning to perspective');

        // Prevent OrbitControls from handling this event
        event.stopImmediatePropagation();

        // Store current camera Y position to determine if we were in Top or Bottom view
        const wasTopView = activeCamera.position.y > controls.target.y;

        // Calculate target position for perspective camera
        const targetToCamera = new THREE.Vector3().subVectors(activeCamera.position, controls.target);
        const distance = targetToCamera.length();

        // Position camera at ~45 degrees from top/bottom
        const newY = wasTopView ? distance * 0.7 : -distance * 0.7;
        const horizontalDist = distance * 0.7;

        const endPos = new THREE.Vector3(
            controls.target.x + horizontalDist,
            controls.target.y + newY,
            controls.target.z + horizontalDist
        );

        // Reset up vectors immediately
        camera.up.set(0, 1, 0);
        orthoCamera.up.set(0, 1, 0);

        // Switch to perspective
        if (isOrthoView) {
            camera.position.copy(activeCamera.position);
            setActiveCamera(false);
        }

        // Animate to the new position
        const startPos = camera.position.clone();
        const anim = { t: 0 };

        new Tween(anim)
            .to({ t: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .onUpdate(() => {
                camera.position.lerpVectors(startPos, endPos, anim.t);
                camera.lookAt(controls.target);
            })
            .onComplete(() => {
                controls.update();
                console.log('[Camera] Transition complete, rotation now enabled');
            })
            .start();
    }
}, true); // Use capture phase to run before OrbitControls

// ============ TransformControls Setup ============
const transformControls = new TransformControls(camera, canvas);
transformControls.setMode('translate'); // Start in move mode
transformControls.setSize(0.5); // 50% smaller gizmo
scene.add(transformControls);

// Function to hide the axis helper lines and E ring
// TransformControls structure: children[0]=gizmo, children[1]=picker, children[2]=helper
function hideTransformGizmoExtras() {
    // Hide the outer rotation sphere/ring (E = trackball rotation)
    transformControls.showE = false;

    // Try to access internal helper directly
    // In some versions of three.js, the helper is stored as _helper or getHelper()
    if (transformControls._helper) {
        transformControls._helper.visible = false;
    }
    if (transformControls.helper) {
        transformControls.helper.visible = false;
    }

    // Debug: Log the structure to understand what we're dealing with
    if (!hideTransformGizmoExtras.logged) {
        console.log('[TransformControls Debug] Children count:', transformControls.children.length);
        transformControls.children.forEach((child, i) => {
            console.log(`  Child ${i}: type=${child.type}, name=${child.name}, children=${child.children ? child.children.length : 0}`);
        });
        hideTransformGizmoExtras.logged = true;
    }

    // Hide any child that is specifically named or typed as helper
    transformControls.children.forEach((child, index) => {
        // The third child (index 2) is typically the helper in three.js TransformControls
        if (index === 2) {
            child.visible = false;
        }

        // Also check by type - helpers are often pure Object3D with only Line children
        if (child.type === 'Object3D') {
            let onlyHasLines = true;
            let hasAnyChildren = false;

            child.children.forEach((subChild) => {
                hasAnyChildren = true;
                if (!subChild.isLine) onlyHasLines = false;
            });

            // If this group only contains lines, it's the helper
            if (hasAnyChildren && onlyHasLines) {
                child.visible = false;
            }
        }

        // Traverse to hide E ring and specific named elements
        child.traverse((obj) => {
            // Hide E ring for rotation
            if (obj.name === 'E' || obj.name === 'XYZE') {
                obj.visible = false;
            }
            // Hide plane helpers
            if (obj.name && (obj.name.includes('XY') || obj.name.includes('XZ') || obj.name.includes('YZ'))) {
                obj.visible = false;
            }
        });
    });
}

// Call after a delay to ensure gizmo is fully initialized
setTimeout(hideTransformGizmoExtras, 50);
setTimeout(hideTransformGizmoExtras, 200);
setTimeout(hideTransformGizmoExtras, 1000);

// Listen for events to re-hide after gizmo is updated
transformControls.addEventListener('objectChange', hideTransformGizmoExtras);
transformControls.addEventListener('change', hideTransformGizmoExtras);

// Disable orbit controls while using transform controls
transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    if (event.value) {
        // Save undo state BEFORE dragging starts (so we can undo to the previous state)
        saveUndoState();
    } else {
        // Sync sliders when done dragging
        syncModelSlidersFromMesh();
        syncFillerSlidersFromMesh();
    }
});

// Current transform mode
let currentTransformMode = 'translate';

// Track which object is being edited: 'model' or 'filler'
let currentEditTarget = 'model';

// ============ Animation / Tweening ============
const TWEEN = {
    tweens: [],
    add(tween) {
        this.tweens.push(tween);
        return tween;
    },
    remove(tween) {
        const index = this.tweens.indexOf(tween);
        if (index !== -1) this.tweens.splice(index, 1);
    },
    update(time) {
        for (let i = 0; i < this.tweens.length; i++) {
            if (this.tweens[i].update(time) === false) {
                this.tweens.splice(i, 1);
                i--;
            }
        }
    }
};

class Tween {
    constructor(target) {
        this.target = target;
        this.toValues = {};
        this.duration = 1000;
        this.easingFunction = t => t; // Linear default
        this.startTime = -1;
        this.onUpdateCallback = null;
        this.onCompleteCallback = null;
    }
    to(values, duration) {
        this.toValues = values;
        this.duration = duration;
        return this;
    }
    easing(easingFunction) {
        this.easingFunction = easingFunction;
        return this;
    }
    onUpdate(callback) {
        this.onUpdateCallback = callback;
        return this;
    }
    onComplete(callback) {
        this.onCompleteCallback = callback;
        return this;
    }
    start() {
        this.startTime = performance.now();
        this.startValues = {};
        for (const key in this.toValues) {
            this.startValues[key] = this.target[key];
        }
        TWEEN.add(this);
        return this;
    }
    update(time) {
        if (this.startTime === -1) return true;
        const elapsed = time - this.startTime;
        const progress = Math.min(elapsed / this.duration, 1);
        const value = this.easingFunction(progress);

        for (const key in this.toValues) {
            this.target[key] = this.startValues[key] + (this.toValues[key] - this.startValues[key]) * value;
        }

        if (this.onUpdateCallback) this.onUpdateCallback(value);

        if (progress === 1) {
            if (this.onCompleteCallback) this.onCompleteCallback();
            return false;
        }
        return true;
    }
}

// Cubic Easing
const Easing = {
    Cubic: {
        Out: t => --t * t * t + 1,
        InOut: t => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
    }
};

// ============ Camera View Functions ============
// (View Cube logic moved to ViewCube.js)

if (isOrthoView) {
    activeCamera = orthoCamera;
    controls.object = orthoCamera;
} else {
    activeCamera = camera;
    controls.object = camera;
}
// Update transform controls to use the new active camera
transformControls.camera = activeCamera;

// Helper to get active controls state
// 0 = ROTATE, 1 = DOLLY, 2 = PAN
function getControlsState() {
    // Access internal state if available, or infer
    // OrbitControls usually exposes .state but it might be internal in some versions.
    // We'll rely on the 'start' event logic below.
    return controls.state;
}

function setActiveCamera(toOrtho) {
    if (toOrtho === isOrthoView) return;

    isOrthoView = toOrtho;
    if (isOrthoView) {
        activeCamera = orthoCamera;
        controls.object = orthoCamera;
        // Enable rotation so 'start' event fires -> allowing auto-switch back to Perspective
        controls.enableRotate = true;
        console.log('[Camera] Switched to Orthographic');
    } else {
        activeCamera = camera;
        controls.object = camera;
        controls.enableRotate = true;
        console.log('[Camera] Switched to Perspective');
    }

    transformControls.camera = activeCamera;

    // Ensure render happens immediately
    // animate() loop will catch it, but good to be explicit for events
    renderer.render(scene, activeCamera);
}

function setCameraView(view) {
    const dist = 100;
    // const target = controls.target.clone(); // Don't clone target yet, we will animate TO it

    // We want to animate from current state to new state
    const currentPos = activeCamera.position.clone();
    const currentTarget = controls.target.clone();
    const currentZoom = activeCamera.zoom;

    // Determine end state
    let endPos = new THREE.Vector3();
    let endTarget = currentTarget.clone(); // Usually target stays same unless we want to center on object
    let endUp = new THREE.Vector3(0, 1, 0);
    let endZoom = 1;
    let isNewOrtho = true;
    // Re-calculate ortho size based on current aspect to ensure correct zoom
    const aspect = window.innerWidth / window.innerHeight;

    if (view === '3d') {
        isNewOrtho = false;
        // Restore last perspective pos or default
        if (state.lastPerspectivePos && state.lastPerspectivePos.length) {
            endPos.fromArray(state.lastPerspectivePos);
        } else {
            endPos.set(currentTarget.x + 100, currentTarget.y + 100, currentTarget.z + 100);
        }
        // Keep target as is
    } else {
        // Calculate ortho position
        switch (view) {
            case 'front': endPos.set(endTarget.x, endTarget.y, endTarget.z + dist); break;
            case 'back': endPos.set(endTarget.x, endTarget.y, endTarget.z - dist); break;
            case 'left': endPos.set(endTarget.x - dist, endTarget.y, endTarget.z); break;
            case 'right': endPos.set(endTarget.x + dist, endTarget.y, endTarget.z); break;
            case 'top': endPos.set(endTarget.x, endTarget.y + dist, endTarget.z + 0.01); endUp.set(0, 0, -1); break;
            case 'bottom': endPos.set(endTarget.x, endTarget.y - dist, endTarget.z + 0.01); endUp.set(0, 0, 1); break;
        }
    }

    // Animation values
    const anim = {
        x: currentPos.x, y: currentPos.y, z: currentPos.z,
        tx: currentTarget.x, ty: currentTarget.y, tz: currentTarget.z,
        zoom: currentZoom
    };

    const targetAnim = {
        x: endPos.x, y: endPos.y, z: endPos.z,
        tx: endTarget.x, ty: endTarget.y, tz: endTarget.z,
        zoom: endZoom
    };

    // If switching cameras, we need to handle that carefully
    // Strategy:
    // 1. If switching Perspective -> Ortho:
    //    - Animate Perspective camera to align with the vector
    //    - Then switch to Ortho at the end
    // 2. If switching Ortho -> Perspective:
    //    - Switch to Perspective immediately (at the ortho position)
    //    - Then animate to the perspective position
    // 3. Ortho -> Ortho:
    //    - Just animate position

    // Simplification: Always use Perspective for the transition if possible, or just animate the Active camera.
    // But Ortho and Perspective have different zoom behaviors (FOV vs Zoom).
    // Better experience: Immediate switch for Type, then animate position.

    if (isNewOrtho !== isOrthoView) {
        // Mode change
        if (isNewOrtho) {
            // Perspective -> Ortho
            // We can't easily animate FOV to 0. 
            // So we will animate Perspective camera to the target orientation first, 
            // then switch to Ortho.

            // Actually, simply moving the Perspective camera to the "Front" position
            // looks like a zoom in.

            setActiveCamera(false); // Use perspective for animation

            new Tween(anim)
                .to(targetAnim, 500)
                .easing(Easing.Cubic.InOut)
                .onUpdate(() => {
                    camera.position.set(anim.x, anim.y, anim.z);
                    controls.target.set(anim.tx, anim.ty, anim.tz);
                    camera.lookAt(controls.target);
                    // Force up vector for Top/Bottom views during transition to avoid gimbal lock flip
                    if (view === 'top' || view === 'bottom') {
                        // We might need to handle UP vector interpolation too, but simple lookAt usually works
                        // except for poles. 
                        // For now let OrbitControls handle it or snap UP at end.
                    }
                })
                .onComplete(() => {
                    // Switch to Ortho
                    setActiveCamera(true);
                    orthoCamera.position.copy(endPos);
                    orthoCamera.up.copy(endUp);
                    orthoCamera.lookAt(endTarget);

                    // Match ortho zoom to fill screen roughly same as perspective?
                    // Fixed zoom for now
                    orthoCamera.zoom = 1;
                    orthoCamera.updateProjectionMatrix();

                    controls.update();
                })
                .start();

        } else {
            // Ortho -> Perspective
            // Switch to Perspective immediately at the orthographic location?
            // Or animate Ortho then switch?
            // "Zoom out" requested.

            setActiveCamera(false); // Switch to perspective
            // Start perspective at current ortho pos (conceptually)
            // But perspective at ortho dist(100) might be very different zoom.
            // Let's just animate from current camera state.

            // Reset UP vector
            camera.up.set(0, 1, 0);

            new Tween(anim)
                .to(targetAnim, 800)
                .easing(Easing.Cubic.InOut)
                .onUpdate(() => {
                    camera.position.set(anim.x, anim.y, anim.z);
                    controls.target.set(anim.tx, anim.ty, anim.tz);
                })
                .start();
        }
    } else {
        // Same mode (Ortho->Ortho or Persp->Persp [3d reset])
        // Just animate
        new Tween(anim)
            .to(targetAnim, 500)
            .easing(Easing.Cubic.InOut)
            .onUpdate(() => {
                activeCamera.position.set(anim.x, anim.y, anim.z);
                controls.target.set(anim.tx, anim.ty, anim.tz);
                if (isNewOrtho) {
                    activeCamera.up.copy(endUp);
                    activeCamera.lookAt(controls.target);
                }
            })
            .start();
    }
}

// Removed: switchToPerspective and updateViewCubeHighlight functions are replaced by the new view cube logic.

// View Cube Setup
const viewCubeCanvas = document.getElementById('view-cube-canvas');
const viewCube = new ViewCube(viewCubeCanvas, camera, controls, (view) => {
    setCameraView(view);
});

// Set transform mode
function setTransformMode(mode) {
    currentTransformMode = mode;
    transformControls.setMode(mode);

    // Re-hide the gizmo extras after mode change (children get recreated)
    hideTransformGizmoExtras();

    // Update UI
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${mode}`).classList.add('active');
}

// ============ Lighting ============
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(50, 100, 50);
directionalLight.castShadow = true;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffd100, 0.3);
fillLight.position.set(-50, 50, -50);
scene.add(fillLight);

// ============ Grid Helper ============
// const gridHelper = new THREE.GridHelper(200, 40, 0x444444, 0x333333);
// scene.add(gridHelper);

// ============ Materials ============
state.materials.model = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    metalness: 0.1,
    roughness: 0.6,
    side: THREE.DoubleSide
});

state.materials.filler = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.2,
    roughness: 0.4,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
});

state.materials.guide = new THREE.MeshBasicMaterial({
    color: 0xFF6600,
    transparent: true,
    opacity: 0.3,
    wireframe: false,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});

state.materials.hooks = new THREE.MeshBasicMaterial({
    color: 0xffd100,
    transparent: true,
    opacity: 0.6,
    wireframe: true
});

state.materials.trimPreview = new THREE.MeshStandardMaterial({
    color: 0xe4002b,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    metalness: 0.3,
    roughness: 0.5
});

// ============ Loaders ============
const gltfLoader = new GLTFLoader();
const stlLoader = new STLLoader();
const stlExporter = new STLExporter();

// ============ CSG Evaluator ============
const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = false;

// ============ Load Rig Template ============
function loadRigTemplate() {
    updateInstruction('Loading rig template...');

    gltfLoader.load(
        'public/rigs/Maryland_Retention_Rig.glb',
        (gltf) => {
            console.log('GLB loaded:', gltf);

            // Rotate rig template to correct orientation
            gltf.scene.rotation.y = Math.PI;

            // Process all meshes in the scene
            gltf.scene.traverse((child) => {
                if (child.isMesh) {
                    const name = child.name.toLowerCase();
                    console.log('Found mesh:', child.name);

                    if (name.includes('base') && name.includes('trim')) {
                        state.rig.baseTrim = child;
                        child.material = state.materials.trimPreview.clone();
                        child.visible = true;
                    } else if (name.includes('filler')) {
                        state.rig.fillerTransform = child;
                        child.material = state.materials.filler;
                        state.originalFillerPosition.copy(child.position);
                        state.originalFillerScale.copy(child.scale);
                        child.visible = true;
                    } else if (name.includes('guide') || name.includes('2mm')) {
                        state.rig.guide2mm = child;
                        child.material = state.materials.guide;
                        child.visible = true;
                    } else if (name.includes('hook')) {
                        state.rig.hooks = child;

                        // Use EdgesGeometry to show only edges (removes diagonal wireframe lines)
                        const edges = new THREE.EdgesGeometry(child.geometry);
                        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
                            color: 0xffd100,
                            transparent: true,
                            opacity: 0.6
                        }));
                        child.add(line);

                        // Hide the actual mesh surface
                        child.material = new THREE.MeshBasicMaterial({ visible: false });
                        child.visible = true;
                    } else if (name.includes('sample') || (name.includes('sample') && name.includes('model'))) {
                        state.rig.sampleModel = child;
                        child.visible = false; // Hide sample, will be replaced by user's scan
                    } else if (name.startsWith('ant_') || name.startsWith('l_') || name.startsWith('r_')) {
                        // Screw components: Ant_Top, Ant_Body, L_Top, L_Body, R_Top, R_Body
                        state.rig.screwMeshes.push(child);
                        child.material = state.materials.trimPreview.clone();
                        child.visible = true;
                        console.log('Screw component found:', child.name);
                    } else if (name.includes('original')) {
                        // Hide original collection
                        child.visible = false;
                    } else {
                        // Hide other meshes
                        child.visible = false;
                    }
                }
            });

            scene.add(gltf.scene);

            // Auto-fit camera to scene
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            controls.target.copy(center);

            hideLoading();
            updateInstruction('Upload your dental scan STL to begin alignment.');
            console.log('Rig components:', state.rig);
        },
        (progress) => {
            const percent = (progress.loaded / progress.total * 100).toFixed(0);
            updateInstruction(`Loading rig template... ${percent}%`);
        },
        (error) => {
            console.error('Error loading GLB:', error);
            updateInstruction('Error loading rig template: ' + error.message);

            // Show error in overlay so it's visible even if overlay persists
            const loader = document.querySelector('#loading-overlay .loader');
            if (loader) {
                loader.innerHTML = `
                    <div style="color: #ff6b6b; text-align: center;">
                        <span style="font-size: 2em;">⚠️</span><br>
                        <p style="color: #ff6b6b; margin-top: 10px;">Error loading rig:<br>${error.message}</p>
                        <p style="font-size: 0.8em; opacity: 0.7; margin-top: 5px;">(Check console for details)</p>
                    </div>`;
            }
        }
    );
}

// ============ Import User STL ============
function importUserSTL(file) {
    const reader = new FileReader();

    reader.onload = (event) => {
        try {
            const geometry = stlLoader.parse(event.target.result);
            geometry.computeVertexNormals();
            geometry.center(); // Center the geometry

            // Remove previous user model if exists
            if (state.userModel) {
                scene.remove(state.userModel);
                state.userModel.geometry.dispose();
            }

            state.userModel = new THREE.Mesh(geometry, state.materials.model);
            state.userModel.name = 'UserModel';

            // Apply default rotation
            state.userModel.rotation.set(
                MODEL_ROTATION_OFFSET.x,
                MODEL_ROTATION_OFFSET.y,
                MODEL_ROTATION_OFFSET.z
            );

            scene.add(state.userModel);

            // Position near the rig
            if (state.rig.hooks) {
                state.userModel.position.copy(state.rig.hooks.position);
            }

            // Enable Step 2
            enableStep(2);
            updateInstruction('Use Move/Rotate to align model. Click model to select, use G for move, R for rotate. Use view cube for orthographic views.');
            syncModelSlidersFromMesh();

            // Attach TransformControls to user model
            transformControls.attach(state.userModel);

            // Save initial state for undo
            saveUndoState();

            document.getElementById('filename-display').textContent = file.name;

        } catch (error) {
            console.error('Error parsing STL:', error);
            updateInstruction('Error loading STL file. Ensure it is a valid STL.');
        }
    };

    reader.readAsArrayBuffer(file);
}

// ============ Boolean Operations ============
// Helper to prepare geometry for CSG operations
// three-bvh-csg requires position, normal, AND uv attributes on ALL geometries
function prepareGeometryForCSG(geometry, name = 'unknown') {
    // Clone to avoid modifying original
    const geo = geometry.clone();

    // Ensure geometry has proper position attribute
    if (!geo.attributes.position) {
        console.error(`[CSG] ${name}: No position attribute!`);
        return null;
    }

    const posCount = geo.attributes.position.count;
    console.log(`[CSG] ${name}: positions=${posCount}, indexed=${geo.index !== null}, hasNormal=${!!geo.attributes.normal}, hasUV=${!!geo.attributes.uv}`);

    // If non-indexed, convert to indexed geometry
    if (!geo.index) {
        console.log(`[CSG] ${name}: Converting non-indexed to indexed geometry`);
        const indices = [];
        for (let i = 0; i < posCount; i++) {
            indices.push(i);
        }
        geo.setIndex(indices);
    }

    // Ensure normals exist
    if (!geo.attributes.normal) {
        console.log(`[CSG] ${name}: Computing normals`);
        geo.computeVertexNormals();
    }

    // CRITICAL: Ensure UV attributes exist (three-bvh-csg requires this)
    if (!geo.attributes.uv) {
        console.log(`[CSG] ${name}: Adding empty UV attribute`);
        const uvArray = new Float32Array(posCount * 2);
        // Fill with zeros (or could use position-based UVs)
        geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    }

    return geo;
}

function processAndMerge() {
    if (!state.userModel) {
        updateInstruction('Please import a model first.');
        return;
    }

    // Disable the process button immediately to prevent double-clicks
    const processBtn = document.getElementById('btn-process');
    if (processBtn) {
        processBtn.disabled = true;
        processBtn.style.opacity = '0.5';
    }

    // Show the liquid glass processing overlay
    showProcessing('Preparing mesh data...');

    // Use setTimeout to allow the overlay to paint before heavy processing begins
    setTimeout(() => {
        doProcessAndMerge();
    }, 50);
}

function doProcessAndMerge() {
    const startTime = performance.now();
    console.log('[CSG] Starting Boolean operations...');
    updateProcessingStatus('Running Boolean operations...');

    try {
        // CRITICAL: Update all matrix world transforms before reading them
        console.log('[CSG] Updating matrix world for all meshes...');
        state.userModel.updateMatrixWorld(true);
        if (state.rig.fillerTransform) state.rig.fillerTransform.updateMatrixWorld(true);
        if (state.rig.baseTrim) state.rig.baseTrim.updateMatrixWorld(true);
        state.rig.screwMeshes.forEach(mesh => mesh.updateMatrixWorld(true));

        // Debug: Log current transforms
        console.log('[CSG] User model position:', state.userModel.position.toArray());
        console.log('[CSG] User model rotation:', state.userModel.rotation.toArray().map(r => (r * 180 / Math.PI).toFixed(1) + '°'));
        console.log('[CSG] User model scale:', state.userModel.scale.toArray());
        if (state.rig.fillerTransform) {
            console.log('[CSG] Filler position:', state.rig.fillerTransform.position.toArray());
            console.log('[CSG] Filler scale:', state.rig.fillerTransform.scale.toArray());
        }

        // Step 1: Prepare user model geometry with current transforms
        // CRITICAL: Apply transform to GEOMETRY (bakes into vertices), not to Brush
        console.log('[CSG] Step 1: Preparing user model...');
        const modelGeo = prepareGeometryForCSG(state.userModel.geometry, 'UserModel');
        if (!modelGeo) throw new Error('User model geometry preparation failed');

        // BAKE the transform into the geometry vertices
        modelGeo.applyMatrix4(state.userModel.matrixWorld);
        console.log('[CSG] User model transform BAKED into geometry');

        const modelBrush = new Brush(modelGeo);
        let resultBrush = modelBrush;

        // Step 2: UNION - Merge filler with user model FIRST
        if (state.rig.fillerTransform?.geometry) {
            console.log('[CSG] Step 2: UNION - Merging filler with model...');
            console.log('[CSG] Filler geometry vertex count:', state.rig.fillerTransform.geometry.attributes.position?.count);
            const fillerGeo = prepareGeometryForCSG(state.rig.fillerTransform.geometry, 'Filler');
            if (fillerGeo) {
                // BAKE filler transform into geometry
                fillerGeo.applyMatrix4(state.rig.fillerTransform.matrixWorld);
                console.log('[CSG] Filler transform BAKED into geometry');

                const fillerBrush = new Brush(fillerGeo);
                resultBrush = csgEvaluator.evaluate(resultBrush, fillerBrush, ADDITION);
                console.log('[CSG] Model + Filler UNION complete');
            }
        }

        // Step 3: SUBTRACT - Remove base-trim (bottom) from merged result
        if (state.rig.baseTrim?.geometry) {
            console.log('[CSG] Step 3: SUBTRACT - Removing base-trim from merged model...');
            const baseGeo = prepareGeometryForCSG(state.rig.baseTrim.geometry, 'Base-trim');
            if (baseGeo) {
                // BAKE transform into geometry
                baseGeo.applyMatrix4(state.rig.baseTrim.matrixWorld);
                const baseBrush = new Brush(baseGeo);
                resultBrush = csgEvaluator.evaluate(resultBrush, baseBrush, SUBTRACTION);
                console.log('[CSG] Base-trim SUBTRACTION complete');
            }
        }

        // Step 4: SUBTRACT - Remove all screw holes from merged result
        console.log(`[CSG] Step 4: SUBTRACT - Removing ${state.rig.screwMeshes.length} screw holes...`);
        for (let i = 0; i < state.rig.screwMeshes.length; i++) {
            const screwMesh = state.rig.screwMeshes[i];
            if (screwMesh?.geometry) {
                console.log(`[CSG] Subtracting screw ${i + 1}/${state.rig.screwMeshes.length}: ${screwMesh.name}`);
                const screwGeo = prepareGeometryForCSG(screwMesh.geometry, screwMesh.name);
                if (screwGeo) {
                    // BAKE transform into geometry
                    screwGeo.applyMatrix4(screwMesh.matrixWorld);
                    const screwBrush = new Brush(screwGeo);
                    resultBrush = csgEvaluator.evaluate(resultBrush, screwBrush, SUBTRACTION);
                }
            }
        }
        console.log('[CSG] All screw SUBTRACTIONS complete');

        console.log('[CSG] All Boolean operations complete, updating mesh...');

        // Mesh cleanup Step 1: Merge duplicate vertices to fix non-manifold edges
        // This welds vertices that are at the same position (within tolerance)
        let cleanedGeometry = BufferGeometryUtils.mergeVertices(resultBrush.geometry, 0.0001);
        console.log('[CSG] Merged duplicate vertices for mesh cleanup');

        // Mesh cleanup Step 2: Recompute normals for proper lighting
        cleanedGeometry.computeVertexNormals();
        console.log('[CSG] Vertex normals recomputed for mesh cleanup');

        // Update the displayed model with final result
        state.userModel.geometry.dispose();
        state.userModel.geometry = cleanedGeometry;
        state.userModel.position.set(0, 0, 0);
        state.userModel.rotation.set(0, 0, 0);
        state.userModel.updateMatrix();

        // Hide filler since it's now merged into the model
        if (state.rig.fillerTransform) {
            state.rig.fillerTransform.visible = false;
        }

        // Hide trim helpers after processing
        if (state.rig.baseTrim) state.rig.baseTrim.visible = false;
        state.rig.screwMeshes.forEach(mesh => mesh.visible = false);

        // [NEW] Hide interactions and specific meshes as requested
        if (state.rig.guide2mm) state.rig.guide2mm.visible = false;
        if (state.rig.hooks) state.rig.hooks.visible = false;

        // [NEW] Lock the model
        transformControls.detach();
        transformControls.enabled = false; // Disable the control itself

        // Disable UI buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });

        state.isProcessed = true;

        const elapsed = (performance.now() - startTime).toFixed(0);
        document.getElementById('processing-time').textContent = `Processed in ${elapsed}ms`;
        console.log(`[CSG] Processing complete in ${elapsed}ms`);

        // Enable export button
        document.getElementById('btn-export').disabled = false;

        // DISABLE all sliders and controls after processing
        setModelSlidersEnabled(false);
        setFillerSlidersEnabled(false);

        // Disable step sections except Export
        document.querySelectorAll('.control-section[data-step="2"], .control-section[data-step="3"]').forEach(section => {
            section.setAttribute('disabled', 'true');
        });

        // Disable Process button (already processed)
        document.getElementById('btn-process').disabled = true;

        // Disable Continue and Back to Model buttons
        const btnContinue = document.getElementById('btn-continue-filler');
        const btnBack = document.getElementById('btn-back-to-model');
        if (btnContinue) {
            btnContinue.disabled = true;
            btnContinue.style.opacity = '0.5';
        }
        if (btnBack) {
            btnBack.disabled = true;
            btnBack.style.opacity = '0.5';
        }

        // Convert Upload STL to Reset button
        const uploadLabel = document.querySelector('label.upload-btn');
        if (uploadLabel) {
            uploadLabel.innerHTML = '<span class="icon">🔄</span> Reset';
            uploadLabel.style.cursor = 'pointer';
            // Remove file input behavior, add reset behavior
            const fileInput = document.getElementById('stl-upload');
            if (fileInput) fileInput.disabled = true;
            uploadLabel.onclick = (e) => {
                e.preventDefault();
                window.location.reload();
            };
        }

        updateInstruction('Processing complete! Click Export STL to download. Use Reset to start over.');

        // Hide the processing overlay
        hideProcessing();

    } catch (error) {
        console.error('[CSG] Boolean operation failed:', error);
        console.error('[CSG] Error stack:', error.stack);
        updateInstruction(`Boolean failed: ${error.message}. Check console.`);

        // Hide the processing overlay on error too
        hideProcessing();
    }
}

// [TEST HELPER] Load internal sample model for debugging
window.loadSampleModel = function () {
    console.log('[Debug] Loading sample model...');
    if (state.rig.sampleModel) {
        // Clone the sample model to act as user model
        const geometry = state.rig.sampleModel.geometry.clone();

        // Remove previous user model if exists
        if (state.userModel) {
            scene.remove(state.userModel);
            state.userModel.geometry.dispose();
        }

        state.userModel = new THREE.Mesh(geometry, state.materials.model);
        state.userModel.name = 'UserModel';

        // Apply default rotation
        state.userModel.rotation.set(
            MODEL_ROTATION_OFFSET.x,
            MODEL_ROTATION_OFFSET.y,
            MODEL_ROTATION_OFFSET.z
        );

        scene.add(state.userModel);

        // Fix position
        if (state.rig.hooks) {
            state.userModel.position.copy(state.rig.hooks.position);
        }

        // Enable Step 2
        enableStep(2);
        updateInstruction('DEBUG: Sample model loaded.');
        syncModelSlidersFromMesh();

        // Attach TransformControls to user model
        transformControls.attach(state.userModel);

        console.log('[Debug] Sample model loaded successfully.');
    } else {
        console.error('[Debug] Sample model not found in rig.');
    }
};

// ============ Export STL ============
// ============ Export STL ============
async function exportSTL() {
    if (!state.userModel) {
        updateInstruction('No model to export.');
        console.error('[Export] No user model loaded');
        return;
    }

    if (!state.isProcessed) {
        updateInstruction('Please run Process & Merge before exporting.');
        console.warn('[Export] Model not processed yet');
        return;
    }

    updateInstruction('Generating STL file...');
    console.log('[Export] Starting export...');

    // Validation
    if (!state.userModel.geometry) {
        console.error('[Export] Model has no geometry!');
        updateInstruction('Export error: Model has no geometry. Try processing again.');
        return;
    }

    const posAttr = state.userModel.geometry.getAttribute('position');
    if (!posAttr || posAttr.count === 0) {
        console.error('[Export] Geometry has no vertices!');
        updateInstruction('Export error: Resulting model is empty.');
        return;
    }

    console.log('[Export] Geometry vertex count:', posAttr.count);

    try {
        // Ensure matrix world is up to date
        state.userModel.updateMatrixWorld(true);

        console.log('[Export] Parsing geometry to STL format (Binary)...');

        // Create a clone of the geometry and bake the world transform into it
        // This ensures all rotations/translations are applied to the vertices
        const exportGeometry = state.userModel.geometry.clone();
        exportGeometry.applyMatrix4(state.userModel.matrixWorld);

        // Apply additional rotation to fix orientation for external apps
        // The geometry has -90° X baked in from processing, so we add +90° to get it flat
        const rotationMatrix = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(90));
        exportGeometry.applyMatrix4(rotationMatrix);
        console.log('[Export] Applied +90° X rotation to exported geometry');

        // Create a temporary mesh with identity transform for export
        const exportMesh = new THREE.Mesh(exportGeometry, state.userModel.material);

        const options = { binary: true };
        const result = stlExporter.parse(exportMesh, options);

        // Check result type
        let blob;
        if (result instanceof DataView) {
            blob = new Blob([result], { type: 'application/octet-stream' });
        } else if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'application/octet-stream' });
        } else if (typeof result === 'string') {
            blob = new Blob([result], { type: 'text/plain' });
        } else {
            console.warn('[Export] Unknown result type:', result);
            blob = new Blob([result], { type: 'application/octet-stream' });
        }

        console.log('[Export] Blob created, size:', blob.size);
        if (blob.size === 0) {
            throw new Error('Generated STL file is empty (0 bytes)');
        }

        const defaultName = `maryland_rig_export_${new Date().getTime()}.stl`;

        // Check for Tauri environment
        if (window.__TAURI__) {
            try {
                const { dialog, fs, path } = window.__TAURI__;

                // Open save dialog
                const filePath = await dialog.save({
                    defaultPath: defaultName,
                    filters: [{
                        name: 'STL Model',
                        extensions: ['stl']
                    }]
                });

                if (filePath) {
                    // Convert Blob/Buffer to Uint8Array/Array for writing
                    let binaryData;
                    if (result instanceof ArrayBuffer) {
                        binaryData = new Uint8Array(result);
                    } else if (result instanceof DataView) {
                        binaryData = new Uint8Array(result.buffer);
                    } else {
                        // Text to binary
                        const encoder = new TextEncoder();
                        binaryData = encoder.encode(result);
                    }

                    // Write file
                    await fs.writeBinaryFile(filePath, binaryData);

                    updateInstruction('STL saved successfully!');
                    console.log('[Export] File saved via Tauri API to:', filePath);
                    return;
                } else {
                    updateInstruction('Export cancelled.');
                    return;
                }
            } catch (tauriErr) {
                console.error('[Export] Tauri export failed:', tauriErr);
                // Fallthrough to standard web export if Tauri fails (unlikely if permissions correct)
            }
        }

        // Modern "Save As" - File System Access API
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultName,
                    types: [{
                        description: 'Stereolithography File',
                        accept: { 'model/stl': ['.stl'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                updateInstruction('STL saved successfully!');
                console.log('[Export] File saved via File System Access API');
                return; // Exit if successful
            } catch (err) {
                if (err.name === 'AbortError') {
                    updateInstruction('Export cancelled.');
                    return;
                }
                console.warn('[Export] File Picker failed, falling back to download:', err);
                // Fallthrough to download method
            }
        }

        // Fallback: Prompt for name and Download
        const filename = prompt('Enter filename to save:', defaultName);
        if (!filename) {
            updateInstruction('Export cancelled.');
            return;
        }

        const finalName = filename.toLowerCase().endsWith('.stl') ? filename : `${filename}.stl`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = finalName;

        document.body.appendChild(link);
        link.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 60000);

        updateInstruction('STL exported successfully!');
        console.log('[Export] Download triggered successfully');

    } catch (error) {
        console.error('[Export] Export failed:', error);
        console.error('[Export] Error stack:', error.stack);
        updateInstruction(`Export failed: ${error.message}. Check console.`);
    }
}

// Simple geometry merge function
function mergeBufferGeometries(geometries) {
    const positions = [];
    const normals = [];

    for (const geometry of geometries) {
        const posAttr = geometry.getAttribute('position');
        const normAttr = geometry.getAttribute('normal');

        for (let i = 0; i < posAttr.count; i++) {
            positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            if (normAttr) {
                normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
            }
        }
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
        merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }

    return merged;
}

// ============ UI Helpers ============
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function updateInstruction(text) {
    document.getElementById('instruction-text').textContent = text;
}

function showProcessing(statusText = 'Running Boolean operations...') {
    const overlay = document.getElementById('processing-overlay');
    const statusEl = document.getElementById('processing-status');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
    if (statusEl) {
        statusEl.textContent = statusText;
    }
}

function hideProcessing() {
    const overlay = document.getElementById('processing-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function updateProcessingStatus(statusText) {
    const statusEl = document.getElementById('processing-status');
    if (statusEl) {
        statusEl.textContent = statusText;
    }
}

function enableStep(stepNum) {
    const sections = document.querySelectorAll('.control-section');
    sections.forEach(section => {
        const step = parseInt(section.dataset.step);
        if (step <= stepNum) {
            section.removeAttribute('disabled');
        }
    });
    state.currentStep = stepNum;

    // Sync filler sliders when enabling step 3
    if (stepNum >= 3) {
        syncFillerSlidersFromMesh();
    }
}

// (Mini-preview functions removed - now using view cube for camera control)

function syncModelSlidersFromMesh() {
    if (!state.userModel) return;

    const pos = state.userModel.position;
    const rot = state.userModel.rotation;

    document.getElementById('model-pos-x').value = pos.x;
    document.getElementById('model-pos-x-val').value = pos.x.toFixed(1);
    document.getElementById('model-pos-y').value = pos.y;
    document.getElementById('model-pos-y-val').value = pos.y.toFixed(1);
    document.getElementById('model-pos-z').value = pos.z;
    document.getElementById('model-pos-z-val').value = pos.z.toFixed(1);

    // Rotation sliders show OFFSET from default rotation
    // Slider = Actual - Default
    let relRotX = THREE.MathUtils.radToDeg(rot.x - MODEL_ROTATION_OFFSET.x);
    let relRotY = THREE.MathUtils.radToDeg(rot.y - MODEL_ROTATION_OFFSET.y);
    let relRotZ = THREE.MathUtils.radToDeg(rot.z - MODEL_ROTATION_OFFSET.z);

    // Normalize angles to -180 to 180 range to prevent slider sticking/jumping
    // This handles cases where Euler angles wrap (e.g., -90 vs 270)
    const normalizeAngle = (angle) => {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    };

    relRotX = normalizeAngle(relRotX);
    relRotY = normalizeAngle(relRotY);
    relRotZ = normalizeAngle(relRotZ);

    document.getElementById('model-rot-x').value = relRotX;
    document.getElementById('model-rot-x-val').value = Math.round(relRotX);
    document.getElementById('model-rot-y').value = relRotY;
    document.getElementById('model-rot-y-val').value = Math.round(relRotY);
    document.getElementById('model-rot-z').value = relRotZ;
    document.getElementById('model-rot-z-val').value = Math.round(relRotZ);
}

function syncFillerSlidersFromMesh() {
    if (!state.rig.fillerTransform) return;

    const mesh = state.rig.fillerTransform;
    const pos = mesh.position;
    const scale = mesh.scale;

    // Position sliders show OFFSET from original position
    const posOffsetX = pos.x - state.originalFillerPosition.x;
    const posOffsetZ = pos.z - state.originalFillerPosition.z;
    document.getElementById('filler-pos-x').value = posOffsetX;
    document.getElementById('filler-pos-x-val').value = posOffsetX.toFixed(1);
    document.getElementById('filler-pos-z').value = posOffsetZ;
    document.getElementById('filler-pos-z-val').value = posOffsetZ.toFixed(1);

    // Scale sliders show MULTIPLIER of original scale
    const scaleMultX = state.originalFillerScale.x > 0 ? scale.x / state.originalFillerScale.x : 1;
    const scaleMultZ = state.originalFillerScale.z > 0 ? scale.z / state.originalFillerScale.z : 1;
    document.getElementById('filler-scale-x').value = scaleMultX;
    document.getElementById('filler-scale-x-val').value = scaleMultX.toFixed(2);
    document.getElementById('filler-scale-z').value = scaleMultZ;
    document.getElementById('filler-scale-z-val').value = scaleMultZ.toFixed(2);
}

// ============ Control Group Enable/Disable ============
// Gray out model alignment sliders when editing filler
function setModelSlidersEnabled(enabled) {
    const opacity = enabled ? '1' : '0.4';
    const pointerEvents = enabled ? 'auto' : 'none';

    // Position sliders
    ['x', 'y', 'z'].forEach(axis => {
        const slider = document.getElementById(`model-pos-${axis}`);
        const input = document.getElementById(`model-pos-${axis}-val`);
        if (slider) {
            slider.disabled = !enabled;
            slider.parentElement.style.opacity = opacity;
            slider.parentElement.style.pointerEvents = pointerEvents;
        }
        if (input) {
            input.disabled = !enabled;
        }
    });

    // Rotation sliders
    ['x', 'y', 'z'].forEach(axis => {
        const slider = document.getElementById(`model-rot-${axis}`);
        const input = document.getElementById(`model-rot-${axis}-val`);
        if (slider) {
            slider.disabled = !enabled;
            slider.parentElement.style.opacity = opacity;
            slider.parentElement.style.pointerEvents = pointerEvents;
        }
        if (input) {
            input.disabled = !enabled;
        }
    });

    console.log(`[UI] Model alignment sliders ${enabled ? 'enabled' : 'disabled'}`);
}

// Gray out arch filler controls when editing model
function setFillerSlidersEnabled(enabled) {
    const opacity = enabled ? '1' : '0.4';
    const pointerEvents = enabled ? 'auto' : 'none';

    // Position sliders
    ['x', 'z'].forEach(axis => {
        const slider = document.getElementById(`filler-pos-${axis}`);
        const input = document.getElementById(`filler-pos-${axis}-val`);
        if (slider) {
            slider.disabled = !enabled;
            slider.parentElement.style.opacity = opacity;
            slider.parentElement.style.pointerEvents = pointerEvents;
        }
        if (input) {
            input.disabled = !enabled;
        }
    });

    // Scale sliders
    ['x', 'z'].forEach(axis => {
        const slider = document.getElementById(`filler-scale-${axis}`);
        const input = document.getElementById(`filler-scale-${axis}-val`);
        if (slider) {
            slider.disabled = !enabled;
            slider.parentElement.style.opacity = opacity;
            slider.parentElement.style.pointerEvents = pointerEvents;
        }
        if (input) {
            input.disabled = !enabled;
        }
    });

    console.log(`[UI] Filler sliders ${enabled ? 'enabled' : 'disabled'}`);
}

// ============ Event Listeners ============
// File upload
document.getElementById('stl-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        importUserSTL(file);
    }
});

// Drag and Drop Support
let dragCounter = 0;
const body = document.body;

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    body.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

body.addEventListener('dragover', (e) => {
    // Explicitly show this is a copy operation
    e.dataTransfer.dropEffect = 'copy';
});

body.addEventListener('dragenter', (e) => {
    dragCounter++;
    body.classList.add('drag-active');
});

body.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter <= 0) {
        body.classList.remove('drag-active');
        // Reset counter in case it drifted
        dragCounter = 0;
    }
});

body.addEventListener('drop', (e) => {
    console.log('[DragDrop] Drop event fired');
    dragCounter = 0;
    body.classList.remove('drag-active');

    const dt = e.dataTransfer;
    const files = dt.files;

    console.log(`[DragDrop] Files dropped: ${files.length}`);

    if (files.length > 0) {
        const file = files[0];
        console.log(`[DragDrop] File: ${file.name}, Type: ${file.type}, Size: ${file.size}`);

        if (file.name.toLowerCase().endsWith('.stl')) {
            importUserSTL(file);
        } else {
            console.warn('[DragDrop] Invalid file type');
            updateInstruction('Error: Please upload a valid .stl file.');
        }
    } else {
        console.warn('[DragDrop] No files found in dataTransfer');
    }
});

// Model position sliders
['x', 'y', 'z'].forEach(axis => {
    const slider = document.getElementById(`model-pos-${axis}`);
    const input = document.getElementById(`model-pos-${axis}-val`);

    const updatePosition = (value) => {
        if (state.userModel) {
            state.userModel.position[axis] = parseFloat(value);
        }
    };

    slider.addEventListener('input', () => {
        input.value = slider.value;
        updatePosition(slider.value);
    });

    input.addEventListener('change', () => {
        slider.value = input.value;
        updatePosition(input.value);
    });
});

// Model rotation sliders
['x', 'y', 'z'].forEach(axis => {
    const slider = document.getElementById(`model-rot-${axis}`);
    const input = document.getElementById(`model-rot-${axis}-val`);

    const updateRotation = (value) => {
        if (state.userModel) {
            // Actual = Default + Slider
            state.userModel.rotation[axis] = MODEL_ROTATION_OFFSET[axis] + THREE.MathUtils.degToRad(parseFloat(value));
        }
    };

    slider.addEventListener('input', () => {
        input.value = slider.value;
        updateRotation(slider.value);
    });

    input.addEventListener('change', () => {
        slider.value = input.value;
        updateRotation(input.value);
    });
});

// Filler position sliders - ADD offset to original position
['x', 'z'].forEach(axis => {
    const slider = document.getElementById(`filler-pos-${axis}`);
    const input = document.getElementById(`filler-pos-${axis}-val`);

    const updatePosition = (value) => {
        if (state.rig.fillerTransform) {
            // Add slider value as offset to original position (slider 0 = original position)
            const originalPos = state.originalFillerPosition[axis];
            state.rig.fillerTransform.position[axis] = originalPos + parseFloat(value);
            console.log(`[Filler] Position ${axis.toUpperCase()} = ${originalPos} + ${value} = ${state.rig.fillerTransform.position[axis]}`);
        }
    };

    slider.addEventListener('input', () => {
        input.value = slider.value;
        updatePosition(slider.value);
        enableStep(3);
    });

    input.addEventListener('change', () => {
        slider.value = input.value;
        updatePosition(input.value);
        enableStep(3);
    });
});

// Filler scale sliders - MULTIPLY original scale
['x', 'z'].forEach(axis => {
    const slider = document.getElementById(`filler-scale-${axis}`);
    const input = document.getElementById(`filler-scale-${axis}-val`);

    const updateScale = (value) => {
        if (state.rig.fillerTransform) {
            // Multiply original scale by slider value (1.0 = 100% original, 0.5 = 50%, 2.0 = 200%)
            const originalScale = state.originalFillerScale[axis];
            state.rig.fillerTransform.scale[axis] = originalScale * parseFloat(value);
            console.log(`[Filler] Scale ${axis.toUpperCase()} = ${originalScale} * ${value} = ${state.rig.fillerTransform.scale[axis]}`);
        }
    };

    slider.addEventListener('input', () => {
        input.value = slider.value;
        updateScale(slider.value);
        enableStep(3);
    });

    input.addEventListener('change', () => {
        slider.value = input.value;
        updateScale(input.value);
        enableStep(3);
    });
});

// Process button
document.getElementById('btn-process').addEventListener('click', () => {
    enableStep(4);
    processAndMerge();
});

// Export button
document.getElementById('btn-export').addEventListener('click', exportSTL);

// Continue to Filler button
const btnContinueFiller = document.getElementById('btn-continue-filler');
const btnBackToModel = document.getElementById('btn-back-to-model');

btnContinueFiller.addEventListener('click', () => {
    // Ignore if already processed
    if (state.isProcessed) return;

    enableStep(4); // Enable steps 3 and 4 together

    // Switch TransformControls to the filler
    if (state.rig.fillerTransform) {
        transformControls.attach(state.rig.fillerTransform);
        // Disable Y-axis for filler - user should not move it up/down
        transformControls.showY = false;
        console.log('[Transform] Switched to Arch Filler (Y-axis disabled)');
    }

    // Update edit target state and button states
    currentEditTarget = 'filler';
    btnContinueFiller.disabled = true;
    btnContinueFiller.style.opacity = '0.5';
    btnBackToModel.disabled = false;
    btnBackToModel.style.opacity = '1';

    // Gray out model alignment sliders, enable filler sliders
    setModelSlidersEnabled(false);
    setFillerSlidersEnabled(true);

    updateInstruction('Adjust the Arch Filler to fill the palatal/lingual void. Use G for move, R for rotate.');

    // Auto-scroll sidebar to show the Export STL button with smooth animation
    setTimeout(() => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            // Use smooth scrolling
            sidebar.scrollTo({
                top: sidebar.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, 200);
});

// Back to Model Alignment button
btnBackToModel.addEventListener('click', () => {
    // Ignore if already processed
    if (state.isProcessed) return;

    // Switch TransformControls back to the user model
    if (state.userModel) {
        transformControls.attach(state.userModel);
        // Re-enable all axes for user model
        transformControls.showY = true;
        console.log('[Transform] Switched back to User Model (all axes enabled)');
    }

    // Update edit target state and button states
    currentEditTarget = 'model';
    btnContinueFiller.disabled = false;
    btnContinueFiller.style.opacity = '1';
    btnBackToModel.disabled = true;
    btnBackToModel.style.opacity = '0.5';

    // Enable model alignment sliders, gray out filler sliders
    setModelSlidersEnabled(true);
    setFillerSlidersEnabled(false);

    updateInstruction('Model alignment mode. Use Move/Rotate to adjust the model position.');
});

// Initialize Back to Model button as disabled (start in model mode)
btnBackToModel.disabled = true;
btnBackToModel.style.opacity = '0.5';

// Initialize filler sliders as disabled (start in model editing mode)
setFillerSlidersEnabled(false);

// Removed: View cube click handlers (now handled by the 3D view cube canvas)

// Mode button handlers
document.getElementById('mode-translate').addEventListener('click', () => setTransformMode('translate'));
document.getElementById('mode-rotate').addEventListener('click', () => setTransformMode('rotate'));

// Gizmo visibility toggle
let gizmoVisible = true;
document.getElementById('toggle-gizmo').addEventListener('click', () => {
    gizmoVisible = !gizmoVisible;
    transformControls.visible = gizmoVisible;
    const toggleBtn = document.getElementById('toggle-gizmo');
    toggleBtn.innerHTML = gizmoVisible ? '👁 Hide' : '👁 Show';
    console.log(`[Gizmo] Visibility: ${gizmoVisible}`);
});

// Window resize
window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;

    // Update perspective camera
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    // Update orthographic camera
    orthoCamera.left = -orthoSize * aspect / 2;
    orthoCamera.right = orthoSize * aspect / 2;
    orthoCamera.top = orthoSize / 2;
    orthoCamera.bottom = -orthoSize / 2;
    orthoCamera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    if (viewCube) viewCube.resize();
});

// Switch back to perspective ONLY when user ROTATES
controls.addEventListener('start', () => {
    // Check if user is rotating
    // OrbitControls.state: 0 = ROTATE, 1 = DOLLY, 2 = PAN
    // We can access it via controls.state if accessible, or infer from mouse buttons

    // If we are in Ortho view
    if (activeCamera === orthoCamera) {
        // If the action is ROTATE (state === 0), switch back to perspective
        // Note: standard three.js OrbitControls uses integers for state
        if (controls.state === 0) { // ROTATE
            // Sync Perspective Camera to Ortho position before switching
            // This prevents "glitched" rotation or jumping
            const orthoPos = orthoCamera.position.clone();
            const target = controls.target.clone();
            const dir = new THREE.Vector3().subVectors(orthoPos, target).normalize();

            // Place perspective camera at standard distance along the same vector
            const perspDist = 100; // Or calculate based on zoom?
            camera.position.copy(target).add(dir.multiplyScalar(perspDist));

            // Fix singularity/gimbal lock for Top/Bottom views (dir.y ~ 1 or -1)
            // If perfectly vertical, lookAt(target) with up=(0,1,0) is degenerate.
            // We nudge Z slightly to maintain a stable orientation (Camera X aligned with World X)
            if (Math.abs(dir.y) > 0.99) {
                console.log('[Camera] Nudging position to avoid gimbal lock at pole');
                camera.position.z += 0.1;
            }

            camera.lookAt(target);
            camera.up.set(0, 1, 0); // Always reset UP to Y-axis for standard orbit navigation

            setActiveCamera(false);
        }
        // If PAN (2) or DOLLY (1), stay in Ortho (do nothing)
    }
});

controls.addEventListener('end', () => {
    // Save the current perspective camera position after interaction ends
    if (activeCamera === camera) {
        state.lastPerspectivePos = camera.position.toArray();
    }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    // G for move (translate)
    if (e.key === 'g' || e.key === 'G') {
        setTransformMode('translate');
    }
    // R for rotate
    if (e.key === 'r' || e.key === 'R') {
        setTransformMode('rotate');
    }
    // ? for help
    if (e.key === '?') {
        const modal = document.getElementById('help-modal');
        modal.classList.remove('hidden');
    }
    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal, #help-modal').forEach(el => el.classList.add('hidden'));
    }
});

// Help Popup Logic
// Help Popup Logic
const btnHelp = document.getElementById('btn-help');
if (btnHelp) {
    btnHelp.addEventListener('click', () => {
        const modal = document.getElementById('help-modal');
        if (modal) modal.classList.remove('hidden');
    });
}

const btnHelpClose = document.getElementById('btn-help-close');
if (btnHelpClose) {
    btnHelpClose.addEventListener('click', () => {
        const modal = document.getElementById('help-modal');
        if (modal) modal.classList.add('hidden');
    });
}

// Close when clicking overlay
const helpOverlay = document.querySelector('#help-modal .help-overlay');
if (helpOverlay) {
    helpOverlay.addEventListener('click', () => {
        const modal = document.getElementById('help-modal');
        if (modal) modal.classList.add('hidden');
    });
}

// Save state before slider changes (on mousedown/focus)
document.querySelectorAll('input[type="range"], input[type="number"]').forEach(input => {
    input.addEventListener('mousedown', saveUndoState);
    input.addEventListener('focus', saveUndoState);
});

// ============ Render Loop ============
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;
const fpsElement = document.getElementById('fps-counter'); // Get FPS element once

// View Cube update function
// View Cube update function
// (Handled by ViewCube class)

// Render loop
function animate() {
    requestAnimationFrame(animate);

    // Update controls
    controls.update();

    // Stats
    frameCount++;
    const time = performance.now();

    // Update Tweens
    TWEEN.update(time);

    if (time >= lastTime + 1000) {
        fpsElement.textContent = `${Math.round((frameCount * 1000) / (time - lastTime))} FPS`;
        frameCount = 0;
        lastTime = time;
    }

    // Render main scene
    renderer.render(scene, activeCamera);

    // Render view cube
    // Update View Cube with ACTIVE camera to ensure it matches current view
    if (viewCube) viewCube.animate(activeCamera);
}

// ============ Initialize ============
loadRigTemplate();
animate();

console.log('Maryland Retention Rig App initialized');
