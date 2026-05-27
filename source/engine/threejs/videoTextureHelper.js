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
        } else if (isRemote && mainFileUrl) {
            // Fallback: If it's a remote URL load, guess the video URL based on mesh name or material name
            let nameToUse = null;
            if (Array.isArray(mesh.material) && mesh.material.length > 0 && mesh.material[0].name) {
                nameToUse = mesh.material[0].name;
            } else if (mesh.material && mesh.material.name) {
                nameToUse = mesh.material.name;
            } else if (mesh.name) {
                nameToUse = mesh.name;
            }
            if (nameToUse) {
                videoUrl = mainFileUrl + nameToUse + '.mp4';
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
            video.play().catch(e => {
                console.warn('Video play failed or video not found at:', videoUrl, e);
            });

            threeObject.userData.videos.push(video);

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
            }

            videoTexture.addEventListener('dispose', () => {
                video.pause();
                video.removeAttribute('src');
                video.load();
            });

            // Clone materials to prevent replacing other objects sharing this material
            if (Array.isArray(mesh.material)) {
                for (let i = 0; i < mesh.material.length; i++) {
                    mesh.material[i] = mesh.material[i].clone();
                    mesh.material[i].map = videoTexture;
                    mesh.material[i].color = new THREE.Color(0xffffff);
                    mesh.material[i].needsUpdate = true;
                }
            } else if (mesh.material) {
                mesh.material = mesh.material.clone();
                mesh.material.map = videoTexture;
                mesh.material.color = new THREE.Color(0xffffff);
                mesh.material.needsUpdate = true;
            }
        }
    });

    // Periodically update the video textures to force a render so it isn't just a static frame
    // This is because Three.js only renders when the camera moves or explicitly told to
    let frameUpdate = () => {
        if (threeObject.userData.videos && threeObject.userData.videos.length > 0) {
            let needsRender = false;
            for(let video of threeObject.userData.videos) {
                if(video.readyState >= video.HAVE_CURRENT_DATA && !video.paused) {
                    needsRender = true;
                    break;
                }
            }
            if(needsRender && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('render_viewer'));
            }
        }
        threeObject.userData.videoFrameId = requestAnimationFrame(frameUpdate);
    };
    frameUpdate();

    // Clean up
    let origDispose = threeObject.dispose;
    threeObject.dispose = function() {
        if(threeObject.userData.videoFrameId) cancelAnimationFrame(threeObject.userData.videoFrameId);
        if(origDispose) origDispose.call(this);
    };
}
