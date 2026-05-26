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
        if (!mesh.isMesh || !mesh.name) return;

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

            if (mesh.name === nameWithoutExt) {
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
            // Fallback: If it's a remote URL load, guess the video URL based on mesh name
            videoUrl = mainFileUrl + mesh.name + '.mp4';
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

            videoTexture.addEventListener('dispose', () => {
                video.pause();
                video.removeAttribute('src');
                video.load();
            });

            if (Array.isArray(mesh.material)) {
                for (let mat of mesh.material) {
                    mat.map = videoTexture;
                    mat.color = new THREE.Color(0xffffff);
                    mat.needsUpdate = true;
                }
            } else if (mesh.material) {
                mesh.material.map = videoTexture;
                mesh.material.color = new THREE.Color(0xffffff);
                mesh.material.needsUpdate = true;
            }
        }
    });
}
