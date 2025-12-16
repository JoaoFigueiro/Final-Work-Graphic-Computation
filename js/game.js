import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

let scene, camera, renderer, player, flashlight, slenderman;
let loadingManager;
let loadingScreen, loadingBar, loadingText;

let minimapContainer, playerMarker, houseMarker, fireMarker;
let isMapVisible = true;

const mapScale = 0.8;
const mapSize = 200;

const clock = new THREE.Clock();
const trees = [];
const pages = [];

let velocity = new THREE.Vector3();

let movement = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

let gameState = {
    pagesCollected: 0,
    batteryLevel: 100,
    batteryDrainRate: 100 / 300,
    gameOver: false,
    gameWon: false,
    isPointerLocked: false,
    flashlightOn: true
};

let slenderLogic = {
    lastTeleport: 0,
    teleportInterval: 8,
    minDistance: 10,
    maxDistance: 25,
    aggressiveness: 0,
    scareCooldown: 0
};

let instructions, crosshair, uiContainer, pageCountUI, batteryBar, winMessage, loseMessage;
let staticElement;
let listener;
let soundStatic, soundFootsteps, soundJumpscare, soundWin;
let stepTimer = 0;
const stepInterval = 0.6;
let bobTimer = 0;
const bobFrequency = 10;
const bobAmplitude = 0.1;
const defaultCameraY = 1.7;
let campfireLight;
const fireParticles = [];
let fireTextureRef = null;
let housePos = new THREE.Vector3(0, -1000, 0);
let soundFlashlight;
let interactMessage;
let campfirePos = new THREE.Vector3();
let soundAmbience;

export function init() {
    instructions = document.getElementById('instructions');
    instructions.style.display = 'none';

    crosshair = document.getElementById('crosshair');
    uiContainer = document.getElementById('ui-container');
    pageCountUI = document.getElementById('page-count');
    batteryBar = document.getElementById('battery-bar');
    winMessage = document.getElementById('win-message');
    loseMessage = document.getElementById('lose-message');

    initStaticEffect();
    initInteractUI();
    initMinimap();

    initLoadingUI();

    loadingManager = new THREE.LoadingManager();

    loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = (itemsLoaded / itemsTotal) * 100;
        loadingBar.style.width = progress + '%';
        loadingText.innerText = `Carregando Pesadelos... ${Math.round(progress)}%`;
    };

    loadingManager.onLoad = function () {
        loadingScreen.style.display = 'none';
        instructions.style.display = 'flex';
    };

    initGame();
    animate();
}

function initInteractUI() {
    interactMessage = document.createElement('div');
    interactMessage.style.position = 'absolute';
    interactMessage.style.top = '60%';
    interactMessage.style.left = '50%';
    interactMessage.style.transform = 'translate(-50%, -50%)';
    interactMessage.style.color = '#ffffff';
    interactMessage.style.fontFamily = 'Arial, sans-serif';
    interactMessage.style.fontSize = '20px';
    interactMessage.style.textShadow = '0px 0px 5px #000';
    interactMessage.style.display = 'none';
    interactMessage.innerHTML = "Pressione <b>[E]</b> para QUEIMAR as páginas";
    document.body.appendChild(interactMessage);
}

function initStaticEffect() {
    staticElement = document.createElement('div');
    staticElement.id = 'static-overlay';

    Object.assign(staticElement.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '10',
        opacity: '0',
        backgroundImage: 'url("https://media.giphy.com/media/oEI9uBYSzLpBK/giphy.gif")',
        backgroundSize: 'cover',
        mixBlendMode: 'overlay'
    });

    document.body.appendChild(staticElement);
}

function updateFireParticles(delta) {
    fireParticles.forEach(p => {
        p.position.y += delta * p.userData.speed;

        p.material.opacity -= delta * 0.8;

        p.material.rotation += delta * p.userData.rotationSpeed;

        if (p.material.opacity <= 0) {
            p.position.y = -1.0;
            p.position.x = p.userData.originX + (Math.random() - 0.5) * 0.5;
            p.position.z = p.userData.originZ + (Math.random() - 0.5) * 0.5;
            p.material.opacity = 1;

            const scale = 1 + Math.random() * 1.5;
            p.scale.set(scale, scale, scale);
        }
    });
}

function initAudio() {
    listener = new THREE.AudioListener();
    camera.add(listener);

    const audioLoader = new THREE.AudioLoader(loadingManager);

    soundStatic = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/static.mp3', function(buffer) {
        soundStatic.setBuffer(buffer);
        soundStatic.setLoop(true);
        soundStatic.setVolume(0);
        soundStatic.play();
    });

    soundFootsteps = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/step_grass.mp3', function(buffer) {
        soundFootsteps.setBuffer(buffer);
        soundFootsteps.setLoop(false);
        soundFootsteps.setVolume(0.3);
        soundFootsteps.detune = (Math.random() - 0.5) * 100;
    });

    soundJumpscare = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/jumpscare.mp3', function(buffer) {
        soundJumpscare.setBuffer(buffer);
        soundJumpscare.setLoop(false);
        soundJumpscare.setVolume(1.0);
    });

    soundFlashlight = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/click.mp3', function(buffer) {
        soundFlashlight.setBuffer(buffer);
        soundFlashlight.setLoop(false);
        soundFlashlight.setVolume(0.5);
    });

    soundAmbience = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/ambience.mp3', function(buffer) {
        soundAmbience.setBuffer(buffer);
        soundAmbience.setLoop(true);
        soundAmbience.setVolume(0.5);
        soundAmbience.play();
    });
}

function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.Fog(0x050510, 10, 45);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    initAudio();

    player = new THREE.Group();
    player.add(camera);
    player.position.set(0, 1.7, 5);
    scene.add(player);

    const ambientLight = new THREE.AmbientLight(0x151535, 1.5);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xffffff, 20, 100, Math.PI / 4, 0.4, 1);

    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight);
    camera.add(flashlight.target);

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    createGrass();
    createHouse();
    createTrees();
    createCampfire();
    createSlenderman();

    instructions.addEventListener('click', startGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
}


let treeModel = null;

function loadTreeModel(callback) {
    if (treeModel) {
        callback(treeModel.clone());
        return;
    }

    const treePath = "/assets/GreenPine";
    const textureLoader = new THREE.TextureLoader(loadingManager);

    const barkTexture = textureLoader.load(treePath + "/bark_0004.jpg");
    const leafTexture = textureLoader.load(treePath + "/DB2X2_L01.png");

    barkTexture.colorSpace = THREE.SRGBColorSpace;
    leafTexture.colorSpace = THREE.SRGBColorSpace;

    barkTexture.wrapS = THREE.RepeatWrapping;
    barkTexture.wrapT = THREE.RepeatWrapping;

    barkTexture.repeat.set(1, 6);

    const objLoader = new OBJLoader(loadingManager);
    objLoader.load(treePath + "/Tree.obj", (tree) => {

        tree.traverse((child) => {
            if (child.isMesh) {
                const meshName = child.name.toLowerCase();
                const matName = child.material.name ? child.material.name.toLowerCase() : "";

                if (meshName.includes("bark") || meshName.includes("trunk") || meshName.includes("stem") || matName.includes("bark")) {

                    child.material = new THREE.MeshStandardMaterial({
                        map: barkTexture,
                        roughness: 0.9,
                        metalness: 0.0,
                        side: THREE.DoubleSide
                    });

                } else {
                    child.material = new THREE.MeshStandardMaterial({
                        map: leafTexture,
                        alphaTest: 0.4,
                        side: THREE.DoubleSide,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            }
        });

        const TREE_SCALE = 3.5;
        tree.scale.set(TREE_SCALE, TREE_SCALE, TREE_SCALE);

        treeModel = tree;
        callback(tree.clone());
    });
}

function createHouse() {
    const path = "/assets/House";

    let x, z;
    let distToSpawn;

    do {
        x = (Math.random() - 0.5) * 180;
        z = (Math.random() - 0.5) * 180;

        distToSpawn = Math.sqrt(x*x + z*z);

    } while (distToSpawn < 30);

    housePos.set(x, -1.2, z);
    console.log("Local da casa definido em:", x, z);

    trees.push({ position: housePos, radius: 12.5 });

    console.log("Casa (com colisão reforçada) criada em:", housePos.x, housePos.z);

    const textureLoader = new THREE.TextureLoader(loadingManager);
    const diffuseMap = textureLoader.load(path + "/cottage_diffuse.png");
    diffuseMap.colorSpace = THREE.SRGBColorSpace;

    const objLoader = new OBJLoader(loadingManager);
    objLoader.load(path + "/cottage_obj.obj", (house) => {

        house.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: diffuseMap,
                    roughness: 0.8,
                    metalness: 0.1,
                    side: THREE.DoubleSide
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        house.position.copy(housePos);

        const scale = 0.7;
        house.scale.set(scale, scale, scale);

        house.rotation.y = Math.random() * Math.PI * 2;

        scene.add(house);

        const houseLight = new THREE.PointLight(0xffaa55, 20, 10);
        houseLight.position.set(x, 2, z);
        scene.add(houseLight);
    });
}


function createCampfire() {
    const campfirePath = "/assets/Campfire";
    const textureLoader = new THREE.TextureLoader(loadingManager);

    const woodTexture = textureLoader.load(campfirePath + "/Campfire_MAT_BaseColor_00.jpg");
    const fireTexture = textureLoader.load(campfirePath + "/Campfire_fire_MAT_BaseColor_Alpha.png");

    fireTextureRef = fireTexture;

    woodTexture.colorSpace = THREE.SRGBColorSpace;
    fireTexture.colorSpace = THREE.SRGBColorSpace;

    const objLoader = new OBJLoader(loadingManager);

    objLoader.load(campfirePath + "/Campfire_clean.OBJ", (campfire) => {

        campfire.traverse((child) => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();
                const matName = child.material.name ? child.material.name.toLowerCase() : "";

                const isFire = (name.includes("fire") || name.includes("flame") || matName.includes("fire"))
                               && !name.includes("campfire");

                if (isFire) {
                    child.material = new THREE.MeshBasicMaterial({
                        map: fireTexture,
                        transparent: true,
                        opacity: 0.6,
                        side: THREE.DoubleSide,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        color: 0xffaa44
                    });
                    child.visible = true;
                } else {
                    child.material = new THREE.MeshStandardMaterial({
                        map: woodTexture,
                        roughness: 1,
                        emissive: 0x332211,
                        emissiveIntensity: 0.2,
                        color: 0xffffff
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            }
        });

        let x, z;
        let validPosition = false;
        let attempts = 0;

        while (!validPosition && attempts < 100) {
            attempts++;
            x = (Math.random() - 0.5) * 180;
            z = (Math.random() - 0.5) * 180;
            validPosition = true;
            for (const tree of trees) {
                if (Math.sqrt((x - tree.position.x)**2 + (z - tree.position.z)**2) < 5.0) {
                    validPosition = false; break;
                }
            }
        }

        if (validPosition) {
            campfire.position.set(x, -1.2, z);
            campfirePos.set(x, -1.2, z);
            const scale = 0.05;
            campfire.scale.set(scale, scale, scale);
            scene.add(campfire);

            campfireLight = new THREE.PointLight(0xff5500, 50, 25);
            campfireLight.position.set(x, 1.5, z);
            campfireLight.castShadow = true;
            campfireLight.shadow.bias = -0.0001;
            scene.add(campfireLight);

            for (let i = 0; i < 25; i++) {
                const material = new THREE.SpriteMaterial({
                    map: fireTextureRef,
                    color: 0xffaa44,
                    blending: THREE.AdditiveBlending,
                    transparent: true,
                    opacity: Math.random()
                });

                const sprite = new THREE.Sprite(material);

                sprite.position.set(
                    x + (Math.random() - 0.5) * 0.5,
                    -1.0 + Math.random() * 0.5,
                    z + (Math.random() - 0.5) * 0.5
                );

                const s = 1.5 + Math.random();
                sprite.scale.set(s, s, s);

                sprite.userData = {
                    originX: x,
                    originZ: z,
                    speed: 1.0 + Math.random() * 1.5,
                    rotationSpeed: (Math.random() - 0.5) * 2
                };

                scene.add(sprite);
                fireParticles.push(sprite);
            }

            console.log("Fogueira com partículas criada em:", x, z);
        }
    });
}

function createGrass() {
    const grassTexture = new THREE.TextureLoader(loadingManager).load(
    "/assets/Ground/grass.jpg"
    );

    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(40, 40);

    const groundMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture,
        roughness: 1,
        metalness: 0
    });

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        groundMaterial
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;

    scene.add(ground);

}


function createTrees() {
    let pagesCreated = 0;
    const maxPages = 3;

    const pageGeo = new THREE.PlaneGeometry(0.4, 0.6);
    const pageMat = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        side: THREE.DoubleSide,
        emissive: 0xaaaaaa,
        emissiveIntensity: 0.1
    });

    for (let i = 0; i < 300; i++) {
        loadTreeModel((tree) => {
            let x, z;
            do {
                x = (Math.random() - 0.5) * 190;
                z = (Math.random() - 0.5) * 190;
            } while (Math.abs(x) < 10 && Math.abs(z) < 10);

            tree.position.set(x, -1.2, z);

            tree.rotation.y = Math.random() * Math.PI * 2;

            scene.add(tree);
            trees.push({ position: tree.position, radius: 1.5 });

            const shouldAddPage = (pagesCreated < maxPages) && (Math.random() < 0.05 || i > 250);

            if (shouldAddPage) {
                const page = new THREE.Mesh(pageGeo, pageMat);

                const trunkRadius = 0.6;

                const angle = Math.random() * Math.PI * 2;

                const pageX = tree.position.x + Math.sin(angle) * trunkRadius;
                const pageZ = tree.position.z + Math.cos(angle) * trunkRadius;

                page.position.set(pageX, 1.5, pageZ);

                page.lookAt(tree.position.x, 1.5, tree.position.z);

                page.rotation.y += Math.PI;

                page.rotation.z = (Math.random() - 0.5) * 0.5;

                page.name = "page";
                scene.add(page);
                pages.push(page);

                pagesCreated++;

                pageCountUI.textContent = `Páginas: 0 / ${maxPages}`;
            }
        });
    }
}


function createSlenderman() {
    const basePath = "/assets/Slenderman";
    const texture = new THREE.TextureLoader(loadingManager).load(basePath + "/Textures/Tex_0666_0.PNG");
    const objLoader = new OBJLoader(loadingManager);

    objLoader.load(basePath + "/3DS Max/Slenderman Model.obj", function (slender) {
        slender.traverse(function (child) {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({ map: texture });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        slender.scale.set(0.008, 0.008, 0.008);

        slender.position.set(0, -10, 0);

        scene.add(slender);

        slenderman = slender;
    });
}


function startGame() {
    document.body.requestPointerLock();

    document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement === renderer.domElement) {
            renderer.domElement.focus();
        }
    });

    if (listener.context.state === 'suspended') {
        listener.context.resume();
    }

    document.addEventListener("mousemove", (e) => {
        if (document.pointerLockElement) {
            e.preventDefault();
        }
    }, { passive: false });

    renderer.domElement.addEventListener("wheel", (e) => {
        e.preventDefault();
    }, { passive: false });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

}

function onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
        gameState.isPointerLocked = true;
        instructions.style.display = 'none';
        crosshair.style.display = 'block';
        uiContainer.style.display = 'block';
    } else {
        if (!gameState.gameOver && !gameState.gameWon) {
            gameState.isPointerLocked = false;
            instructions.style.display = 'flex';
            crosshair.style.display = 'none';
            uiContainer.style.display = 'none';
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': movement.forward = true; break;
        case 'KeyS': movement.backward = true; break;
        case 'KeyA': movement.left = true; break;
        case 'KeyD': movement.right = true; break;

        case 'KeyM':
            isMapVisible = !isMapVisible;
            minimapContainer.style.display = isMapVisible ? 'block' : 'none';
            break;

        case 'KeyF':
            if (!gameState.gameOver && !gameState.gameWon && gameState.batteryLevel > 0) {

                if (soundFlashlight) {
                    if (soundFlashlight.isPlaying) soundFlashlight.stop();
                    soundFlashlight.play();
                }

                gameState.flashlightOn = !gameState.flashlightOn;

                flashlight.intensity = gameState.flashlightOn ? 20 : 0;
            }
            break;

        case 'KeyE':
            if (gameState.pagesCollected >= 3) {
                const distToFire = player.position.distanceTo(campfirePos);

                if (distToFire < 6.0) {
                    handleGameWin();
                }
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': movement.forward = false; break;
        case 'KeyS': movement.backward = false; break;
        case 'KeyA': movement.left = false; break;
        case 'KeyD': movement.right = false; break;
    }
}

function onMouseMove(event) {
    if (!gameState.isPointerLocked) return;
    const moveX = event.movementX || 0;
    const moveY = event.movementY || 0;
    player.rotation.y -= moveX * 0.002;
    camera.rotation.x -= moveY * 0.002;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI / 2, Math.PI / 2);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (gameState.isPointerLocked && !gameState.gameOver && !gameState.gameWon) {
        handleMovement(delta);
        updateBattery(delta);
        checkInteractions();
        updateSlenderman(delta, time);

        updateFireParticles(delta);
        updateMinimap();

        if (campfireLight) {
            campfireLight.intensity = 40 + Math.sin(time * 10) * 10 + Math.random() * 5;
            campfireLight.position.y = 1.0 + Math.sin(time * 20) * 0.1;
        }
    }
    renderer.render(scene, camera);
}


function handleMovement(delta) {
    const moveSpeed = 2.8 * delta;
    velocity.set(0, 0, 0);
    let isMoving = false;

    if (movement.forward) { velocity.z -= moveSpeed; isMoving = true; }
    if (movement.backward) { velocity.z += moveSpeed; isMoving = true; }
    if (movement.left) { velocity.x -= moveSpeed; isMoving = true; }
    if (movement.right) { velocity.x += moveSpeed; isMoving = true; }

    player.translateX(velocity.x);
    player.translateZ(velocity.z);

    if (isMoving && !gameState.gameOver) {
        bobTimer += delta * bobFrequency;

        player.position.y = defaultCameraY + Math.sin(bobTimer) * bobAmplitude;

        player.rotation.z = Math.cos(bobTimer * 0.5) * 0.002;

        stepTimer += delta;
        if (stepTimer > stepInterval) {
            if (soundFootsteps.isPlaying) soundFootsteps.stop();
            soundFootsteps.setDetune((Math.random() - 0.5) * 200);
            soundFootsteps.play();
            stepTimer = 0;
        }
    } else {
        player.position.y = THREE.MathUtils.lerp(player.position.y, defaultCameraY, delta * 5);
        player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, 0, delta * 5);
        bobTimer = 0;
        stepTimer = stepInterval;
    }

    const playerPos = player.position;
    for (const tree of trees) {
        const dx = playerPos.x - tree.position.x;
        const dz = playerPos.z - tree.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < tree.radius) {
            const overlap = tree.radius - dist;
            const pushX = (dx / dist) * overlap;
            const pushZ = (dz / dist) * overlap;
            player.position.x += pushX;
            player.position.z += pushZ;
        }
    }

    player.position.x = THREE.MathUtils.clamp(player.position.x, -98, 98);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -98, 98);
}

function updateBattery(delta) {
    if (!gameState.flashlightOn || gameState.gameOver || gameState.gameWon) return;

    gameState.batteryLevel -= gameState.batteryDrainRate * delta;
    gameState.batteryLevel = Math.max(0, gameState.batteryLevel);

    batteryBar.style.width = gameState.batteryLevel + '%';

    if (gameState.batteryLevel < 30) {
        batteryBar.style.backgroundColor = '#f44336';
    } else if (gameState.batteryLevel < 60) {
        batteryBar.style.backgroundColor = '#ffeb3b';
    }

    if (gameState.batteryLevel <= 0) {
        flashlight.intensity = 0;
        gameState.flashlightOn = false;
        handleGameOver(false);
    }
}

function checkInteractions() {
    for (let i = pages.length - 1; i >= 0; i--) {
        const page = pages[i];
        const dist = player.position.distanceTo(page.position);

        if (dist < 2.5) {
            scene.remove(page);
            pages.splice(i, 1);
            gameState.pagesCollected++;

            if (gameState.pagesCollected < 3) {
                pageCountUI.textContent = `Páginas: ${gameState.pagesCollected} / 3`;
            } else {
                pageCountUI.textContent = "QUEIME AS PÁGINAS! Encontre a fogueira!";
                pageCountUI.style.color = "#ff5500";
                pageCountUI.style.fontSize = "24px";
                pageCountUI.style.textShadow = "0px 0px 10px #ff0000";
            }
        }
    }

    if (gameState.pagesCollected >= 3) {
        const distToFire = player.position.distanceTo(campfirePos);

        if (distToFire < 6.0) {
            interactMessage.style.display = 'block';
        } else {
            interactMessage.style.display = 'none';
        }
    }
}

function updateSlenderman(delta, time) {
    if (!slenderman) return;

    slenderLogic.lastTeleport += delta;

    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection);

    const toSlender = slenderman.position.clone().sub(player.position).normalize();
    const distance = player.position.distanceTo(slenderman.position);

    const isLookingAt = playerDirection.dot(toSlender);

    slenderman.lookAt(player.position.x, slenderman.position.y, player.position.z);

    let staticIntensity = 0;

    if (distance < 20) {
        staticIntensity += (20 - distance) / 20;
    }

    if (distance < 30 && isLookingAt > 0.5) {
        staticIntensity += (isLookingAt - 0.5) * 2;
    }

    if (staticIntensity > 0) {
        staticIntensity += (Math.random() - 0.5) * 0.2;
    }

    const finalIntensity = THREE.MathUtils.clamp(staticIntensity, 0, 0.8);

    if (staticElement) {
        staticElement.style.opacity = finalIntensity;
    }

    if (soundStatic && soundStatic.buffer) {
        soundStatic.setVolume(finalIntensity * 0.5);
    }

    if (distance < 8.0 && isLookingAt > 0.7) {
        handleGameOver(true);
        return;
    }

    let teleportTime;

    switch (gameState.pagesCollected) {
        case 0:
            teleportTime = 15.0;
            break;
        case 1:
            teleportTime = 10.0;
            break;
        case 2:
            teleportTime = 5.0;
            break;
        default:
            teleportTime = 2.5;
            break;
    }

    const currentInterval = Math.max(1.0, teleportTime);

    if (slenderLogic.lastTeleport > currentInterval) {
        teleportSlenderman(playerDirection);
        slenderLogic.lastTeleport = 0;
    }
}

function teleportSlenderman(playerViewDir) {
    const chanceToSpawnInFront = 0.2 + (gameState.pagesCollected * 0.15);
    const angle = Math.random();

    let spawnPos = new THREE.Vector3();
    const dist = slenderLogic.minDistance + Math.random() * (slenderLogic.maxDistance - slenderLogic.minDistance);

    if (angle < chanceToSpawnInFront) {
        spawnPos.copy(player.position).add(playerViewDir.multiplyScalar(dist));
    } else {
        const randomAngle = Math.random() * Math.PI * 2;
        spawnPos.set(
            player.position.x + Math.cos(randomAngle) * dist,
            player.position.y,
            player.position.z + Math.sin(randomAngle) * dist
        );
    }

    if (gameState.pagesCollected <= 1) {
        const dist = spawnPos.distanceTo(player.position);
        if (dist < 15.0) {
            spawnPos.add(playerViewDir.multiplyScalar(10));
        }
    }

    spawnPos.y = 2.68;

    slenderman.position.copy(spawnPos);
}

function handleGameOver(wasCaught) {
    if (gameState.gameOver) return;

    gameState.gameOver = true;
    document.exitPointerLock();
    crosshair.style.display = 'none';
    uiContainer.style.display = 'none';

    if (soundFootsteps && soundFootsteps.isPlaying) soundFootsteps.stop();
    if (soundStatic) soundStatic.stop();

    if (wasCaught) {
        if (soundJumpscare) soundJumpscare.play();

        staticElement.style.opacity = '1';
        loseMessage.innerHTML = '<h2>VOCÊ FOI PEGO!</h2><p>A criatura te alcançou na escuridão.</p>';
    } else {
        staticElement.style.opacity = '0.2';
        loseMessage.innerHTML = '<h2>FIM DE JOGO</h2><p>A bateria acabou... A escuridão te consumiu.</p>';
    }
    loseMessage.style.display = 'block';
}

function handleGameWin() {
    if (gameState.gameWon) return;

    gameState.gameWon = true;
    document.exitPointerLock();

    if (soundFootsteps) soundFootsteps.stop();
    if (soundStatic) soundStatic.stop();
    if (soundAmbience) soundAmbience.stop();

    crosshair.style.display = 'none';
    uiContainer.style.display = 'none';

    winMessage.innerHTML = '<h1>MALDIÇÃO QUEBRADA!</h1><p>As chamas consumiram as páginas... O Slenderman desapareceu.</p><p>Pressione F5 para jogar novamente.</p>';

    winMessage.style.color = '#ffaa00';

    winMessage.style.display = 'block';
}

function initMinimap() {
    minimapContainer = document.createElement('div');
    Object.assign(minimapContainer.style, {
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: `${mapSize}px`,
        height: `${mapSize}px`,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        border: '2px solid #444',
        borderRadius: '50%',
        overflow: 'hidden',
        zIndex: '100',
        display: 'block'
    });
    document.body.appendChild(minimapContainer);

    playerMarker = document.createElement('div');
    Object.assign(playerMarker.style, {
        position: 'absolute',
        width: '10px',
        height: '10px',
        backgroundColor: '#00ff00',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '102'
    });
    minimapContainer.appendChild(playerMarker);

    houseMarker = document.createElement('div');
    Object.assign(houseMarker.style, {
        position: 'absolute',
        width: '12px',
        height: '12px',
        backgroundColor: '#00aaff',
        border: '1px solid white',
        transform: 'translate(-50%, -50%)',
        zIndex: '101'
    });
    minimapContainer.appendChild(houseMarker);

    fireMarker = document.createElement('div');
    Object.assign(fireMarker.style, {
        position: 'absolute',
        width: '10px',
        height: '10px',
        backgroundColor: '#ff5500',
        borderRadius: '50%',
        boxShadow: '0 0 5px #ff5500',
        transform: 'translate(-50%, -50%)',
        zIndex: '101',
        display: 'none'
    });
    minimapContainer.appendChild(fireMarker);

    const mapHelp = document.createElement('div');
    mapHelp.innerText = "[M] Mapa";
    Object.assign(mapHelp.style, {
        position: 'absolute',
        bottom: '-25px',
        right: '0',
        width: '100%',
        textAlign: 'center',
        color: 'white',
        fontFamily: 'Arial',
        fontSize: '12px'
    });
    minimapContainer.appendChild(mapHelp);
}

function updateMinimap() {
    if (!isMapVisible || !player) return;

    const cx = mapSize / 2;
    const cy = mapSize / 2;

    const px = player.position.x;
    const pz = player.position.z;

    const mapPlayerX = cx + (px * mapScale);
    const mapPlayerY = cy + (pz * mapScale);

    playerMarker.style.left = `${mapPlayerX}px`;
    playerMarker.style.top = `${mapPlayerY}px`;

    const mapHouseX = cx + (housePos.x * mapScale);
    const mapHouseY = cx + (housePos.z * mapScale);
    houseMarker.style.left = `${mapHouseX}px`;
    houseMarker.style.top = `${mapHouseY}px`;

    if (campfirePos.lengthSq() > 0) {
        fireMarker.style.display = 'block';
        const mapFireX = cx + (campfirePos.x * mapScale);
        const mapFireY = cx + (campfirePos.z * mapScale);
        fireMarker.style.left = `${mapFireX}px`;
        fireMarker.style.top = `${mapFireY}px`;
    }

    const existingPageDots = document.querySelectorAll('.page-dot');
    existingPageDots.forEach(dot => dot.remove());

    pages.forEach(page => {
        const dot = document.createElement('div');
        dot.className = 'page-dot';
        Object.assign(dot.style, {
            position: 'absolute',
            width: '6px',
            height: '6px',
            backgroundColor: '#ff0000',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: '100'
        });

        const mapPageX = cx + (page.position.x * mapScale);
        const mapPageY = cy + (page.position.z * mapScale);

        dot.style.left = `${mapPageX}px`;
        dot.style.top = `${mapPageY}px`;

        minimapContainer.appendChild(dot);
    });
}


function initLoadingUI() {
    loadingScreen = document.createElement('div');
    Object.assign(loadingScreen.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        zIndex: '1000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'Arial, sans-serif'
    });

    loadingText = document.createElement('div');
    loadingText.innerText = "Carregando Pesadelos... 0%";
    loadingText.style.color = '#ffffff';
    loadingText.style.marginBottom = '20px';
    loadingText.style.fontSize = '20px';
    loadingScreen.appendChild(loadingText);

    const barContainer = document.createElement('div');
    Object.assign(barContainer.style, {
        width: '300px',
        height: '20px',
        border: '2px solid #ffffff',
        borderRadius: '10px',
        overflow: 'hidden'
    });
    loadingScreen.appendChild(barContainer);

    loadingBar = document.createElement('div');
    Object.assign(loadingBar.style, {
        width: '0%',
        height: '100%',
        backgroundColor: '#ff0000',
        transition: 'width 0.2s'
    });
    barContainer.appendChild(loadingBar);

    document.body.appendChild(loadingScreen);
}