import * as THREE from 'three';
import { FileSource, GetFileName } from '../io/fileutils.js';
import { CreateObjectUrlWithMimeType } from '../io/bufferutils.js';

export function ApplyVideoTextures (threeObject, importer, objectUrls) {
    let fileList = importer.GetFileList().GetFiles();

    // We try to figure out if there is a base URL for network fetching
    let mainFileUrl = null;
    let isRemote = false;
    if (fileList.length > 0) {
        // usually the first file is main, but we can search for the one that has .glb or .gltf
        for (let file of fileList) {
            if (file.source === FileSource.Url) {
                isRemote = true;
                let urlStr = file.data;
                let lastSlash = urlStr.lastIndexOf('/');
                if (lastSlash !== -1) {
                    mainFileUrl = urlStr.substring(0, lastSlash + 1);
                }
                break;
            }
        }
    }

    let videoFiles = [];
    for (let file of fileList) {
        if (file.extension.toLowerCase() === 'mp4') {
            videoFiles.push(file);
        }
    }

    // Attach videos array to object userData for external play/pause access
    threeObject.userData.videos = [];

    // Removed the videoFiles.length > 0 check because the user wants auto-discovery
    // even if no MP4s were explicitly uploaded.
    let attemptUrlFallback = (isRemote && mainFileUrl);

    // We only want to try fetching network videos if the user has opted in or if we find a reason to
    // But since the user specifically requested: "I will provide mp4 videos in the same folder as this glb model... inject dynamic video stream",
    // We need to fetch it based on mesh name.
    // However, sending hundreds of 404s for a normal 100-mesh GLB is bad.
    // Since we don't have an explicit option yet, we'll implement it by making a quick HEAD request
    // or we just accept that 404s will happen, but we can limit it to 5 failed attempts maybe?
    let networkFailures = 0;
    const MAX_NETWORK_FAILURES = 5;

    threeObject.traverse((mesh) => {
        if (!mesh.isMesh) return;

        let videoUrl = null;

        // Try to match from local uploaded/provided files
        let matchingVideoFile = null;
        for (let videoFile of videoFiles) {
            let videoFileName = GetFileName(videoFile.name);
            let nameWithoutExt = videoFileName;
            let lastDotIdx = videoFileName.lastIndexOf('.');
            if (lastDotIdx !== -1) {
                 nameWithoutExt = videoFileName.substring(0, lastDotIdx);
            }

            let matchByMeshName = (mesh.name === nameWithoutExt);
            let matchByMatName = false;

            if (!matchByMeshName) {
                if (Array.isArray(mesh.material)) {
                    for (let mat of mesh.material) {
                        if (mat.name && mat.name === nameWithoutExt) {
                            matchByMatName = true;
                            break;
                        }
                    }
                } else if (mesh.material && mesh.material.name && mesh.material.name === nameWithoutExt) {
                    matchByMatName = true;
                }
            }

            if (matchByMeshName || matchByMatName) {
                matchingVideoFile = videoFile;
                break;
            }
        }

        if (matchingVideoFile) {
            if (matchingVideoFile.source === FileSource.Url) {
                videoUrl = matchingVideoFile.data;
            } else if (matchingVideoFile.source === FileSource.File) {
                videoUrl = URL.createObjectURL(matchingVideoFile.data);
                objectUrls.push(videoUrl);
            } else if (matchingVideoFile.source === FileSource.Decompressed) {
                videoUrl = CreateObjectUrlWithMimeType(matchingVideoFile.data, 'video/mp4');
                objectUrls.push(videoUrl);
            }
        } else if (attemptUrlFallback && networkFailures < MAX_NETWORK_FAILURES) {
            // Naming convention:
            // - Ends with '_video' -> request .mp4
            // - Ends with '_videoa' (or '_videoA') -> request .webm, and make material transparent
            let nameToUse = null;
            let matName = (Array.isArray(mesh.material) && mesh.material.length > 0) ? mesh.material[0].name : (mesh.material ? mesh.material.name : null);
            let meshName = mesh.name;

            let isTransparentVideo = false;

            let checkName = (name) => {
                if (!name) return false;
                let lowerName = name.toLowerCase();
                if (lowerName.endsWith('_videoa')) {
                    isTransparentVideo = true;
                    nameToUse = name;
                    return true;
                } else if (lowerName.endsWith('_video')) {
                    isTransparentVideo = false;
                    nameToUse = name;
                    return true;
                }
                return false;
            };

            checkName(matName) || checkName(meshName);

            if (nameToUse) {
                // To be safe with URL encodings (e.g. Chinese characters)
                let ext = isTransparentVideo ? '.webm' : '.mp4';
                videoUrl = mainFileUrl + encodeURIComponent(nameToUse) + ext;
                mesh.userData.isVideoTransparent = isTransparentVideo;
            }
        }

        if (videoUrl) {
            let video = document.createElement('video');
            video.src = videoUrl;
            video.crossOrigin = 'anonymous';
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;

            let videoTexture = new THREE.VideoTexture(video);
            videoTexture.colorSpace = THREE.SRGBColorSpace;
            videoTexture.flipY = false;

            // inherit properties from original material map if exists
            let origMap = null;
            if (Array.isArray(mesh.material) && mesh.material.length > 0) origMap = mesh.material[0].map;
            else if (mesh.material) origMap = mesh.material.map;

            if (origMap) {
                videoTexture.wrapS = origMap.wrapS;
                videoTexture.wrapT = origMap.wrapT;
                videoTexture.repeat.copy(origMap.repeat);
                videoTexture.offset.copy(origMap.offset);
                videoTexture.rotation = origMap.rotation;
                videoTexture.center.copy(origMap.center);
                videoTexture.flipY = origMap.flipY;
                videoTexture.minFilter = origMap.minFilter;
                videoTexture.magFilter = origMap.magFilter;
                videoTexture.generateMipmaps = origMap.generateMipmaps;

                // Fix for mirrored video: flip horizontally by making repeat.x negative
                // and ensuring wrapping allows repetition.
                videoTexture.wrapS = THREE.RepeatWrapping;
                videoTexture.repeat.x *= -1;
            } else {
                videoTexture.wrapS = THREE.RepeatWrapping;
                videoTexture.repeat.x = -1;
            }

            let frameUpdateId = null;

            videoTexture.addEventListener('dispose', () => {
                if (frameUpdateId !== null) {
                    cancelAnimationFrame(frameUpdateId);
                    frameUpdateId = null;
                }
                video.pause();
                video.removeAttribute('src');
                video.load();
            });

            const applyMaterial = () => {
                // Clone materials to prevent replacing other objects sharing this material
                const cleanMaterial = (mat) => {
                    mat.map = videoTexture;
                    mat.color = new THREE.Color(0xffffff);

                    // Fix for darkness: use emissive map to make the video self-illuminating
                    mat.emissiveMap = videoTexture;
                    mat.emissive = new THREE.Color(0xaaaaaa); // Lowered brightness to prevent over-saturation

                    if (mesh.userData.isVideoTransparent) {
                        mat.transparent = true;
                        mat.alphaMap = videoTexture;
                    }

                    if (mat.lightMap) mat.lightMap = null;
                    if (mat.aoMap) mat.aoMap = null;
                    if (mat.bumpMap) mat.bumpMap = null;
                    if (mat.normalMap) mat.normalMap = null;
                    if (mat.displacementMap) mat.displacementMap = null;
                    if (mat.roughnessMap) mat.roughnessMap = null;
                    if (mat.metalnessMap) mat.metalnessMap = null;
                    if (mat.alphaMap) mat.alphaMap = null;
                    if (mat.envMap) mat.envMap = null;
                    if (mat.clearcoatMap) mat.clearcoatMap = null;
                    if (mat.clearcoatRoughnessMap) mat.clearcoatRoughnessMap = null;
                    if (mat.clearcoatNormalMap) mat.clearcoatNormalMap = null;

                    if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                        mat.metalness = 0.0;
                        mat.roughness = 1.0;
                    }
                    mat.needsUpdate = true;
                };

                if (Array.isArray(mesh.material)) {
                    for (let i = 0; i < mesh.material.length; i++) {
                        // Only apply to the specific material if matched by name, or if we matched by mesh name
                        let matNameMatch = false;
                        let meshNameMatch = false;
                        let meshNameWithoutExt = null;
                        if (matchingVideoFile) {
                            meshNameWithoutExt = GetFileName(matchingVideoFile.name);
                            let lastDotIdx = meshNameWithoutExt.lastIndexOf('.');
                            if (lastDotIdx !== -1) {
                                meshNameWithoutExt = meshNameWithoutExt.substring(0, lastDotIdx);
                            }
                            meshNameMatch = (mesh.name === meshNameWithoutExt);
                            if (mesh.material[i].name && mesh.material[i].name === meshNameWithoutExt) {
                                matNameMatch = true;
                            }
                        } else {
                            // Decode URL to try and match against fallback URL match
                            let fallbackNameMatch = null;
                            if (videoUrl) {
                                let lastSlash = videoUrl.lastIndexOf('/');
                                if (lastSlash !== -1) {
                                    let filePart = videoUrl.substring(lastSlash + 1);
                                    let decoded = decodeURIComponent(filePart);
                                    let lastDot = decoded.lastIndexOf('.');
                                    if (lastDot !== -1) {
                                        fallbackNameMatch = decoded.substring(0, lastDot);
                                    }
                                }
                            }
                            if (fallbackNameMatch) {
                                meshNameMatch = (mesh.name === fallbackNameMatch);
                                if (mesh.material[i].name && mesh.material[i].name === fallbackNameMatch) {
                                    matNameMatch = true;
                                }
                            }
                        }
                        if (meshNameMatch || matNameMatch) {
                            mesh.material[i] = mesh.material[i].clone();
                            cleanMaterial(mesh.material[i]);
                        }
                    }
                } else if (mesh.material) {
                    mesh.material = mesh.material.clone();
                    cleanMaterial(mesh.material);
                }

                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('render_viewer'));
                }

                // Start a render loop for this specific video texture to keep the frame updating
                // To avoid spamming, only trigger if window is defined and viewer actually needs it.
                // It's the most reliable way since we can't easily hook into viewer's internal render loop from here.
                let lastTime = 0;
                let frameUpdate = (time) => {
                    if(video.readyState >= video.HAVE_CURRENT_DATA && !video.paused) {
                        // Limit to ~30 FPS for rendering updates to save battery/performance
                        if (time - lastTime > 33) {
                            if(typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('render_viewer'));
                            }
                            lastTime = time;
                        }
                    }
                    frameUpdateId = requestAnimationFrame(frameUpdate);
                };
                frameUpdate(performance.now());
            };

            // Only apply the material and add to playback list if the video actually loads successfully
            const onCanPlay = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                applyMaterial();
                threeObject.userData.videos.push(video);
            };

            video.addEventListener('canplay', onCanPlay);
            video.addEventListener('loadeddata', onCanPlay);

            video.addEventListener('error', (e) => {
                // If it's a fallback url, count it as a network failure
                if (!matchingVideoFile) {
                    networkFailures++;
                }
                // Do not apply the video texture if it fails to load (prevents black meshes)
            });

            video.play().catch(e => {
                console.warn('Video play failed:', videoUrl, e);
            });
        }
    });
}
