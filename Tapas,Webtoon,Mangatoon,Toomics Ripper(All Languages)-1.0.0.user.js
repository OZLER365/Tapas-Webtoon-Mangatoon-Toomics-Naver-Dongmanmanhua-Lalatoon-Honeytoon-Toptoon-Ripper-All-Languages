// ==UserScript==
// @name         Tapas,Webtoon,Mangatoon,Toomics Ripper(All Languages)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  One click download for all 4 sites mentioned and also all for language variant sites
// @author       ozler365
// @license      MIT
// @icon         https://play-lh.googleusercontent.com/f-QNkVqxUj2NS_V9FyEHp68CP7gfqSUTFNBJau6tSRn5hB5TePjUvTM0cQ-TLvU88M3qyvW3akPJ1bHbd0jFSw
// @match        https://global.toomics.com/*
// @match        https://mangatoon.mobi/*
// @match        https://tapas.io/*
// @match        https://www.webtoons.com/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @downloadURL https://update.greasyfork.org/scripts/594644/Tapas%2CWebtoon%2CMangatoon%2CToomics%20Ripper%28All%20Languages%29.user.js
// @updateURL https://update.greasyfork.org/scripts/594644/Tapas%2CWebtoon%2CMangatoon%2CToomics%20Ripper%28All%20Languages%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- State Variables ---
    const downloadedUrls = new Set();
    let isDownloading = false;
    let downloadProgress = { total: 0, completed: 0, failed: 0 };

    // --- Site-Specific Strict Configurations ---
    const siteConfigs = [
        { host: 'toomics.com', container: '#viewer-img', imgSelector: 'img', attrs: ['data-src', 'src'] },
        { host: 'mangatoon.mobi', container: '.pictures', imgSelector: 'img.lazyload_img, img', attrs: ['data-src', 'src'] },
        { host: 'tapas.io', container: '.episode-unit', titleSelector: '.title', imgSelector: 'article.viewer__body img.content__img, article.viewer__body img', attrs: ['data-src', 'src'] },
        { host: 'webtoons.com', container: '#_imageList', imgSelector: 'img._images', attrs: ['data-url', 'src'] }
    ];

    function getCurrentSiteConfig() {
        return siteConfigs.find(config => window.location.hostname.includes(config.host));
    }

    // --- Utility: Sanitize Folder Name ---
    function getFolderName(rawTitle = document.title) {
        return rawTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'Extracted_Images';
    }

    // --- UI Status Updater ---
    function updateButtonStatus(customMessage = null) {
        const btn = document.getElementById('gm-download-btn');
        if (!btn) return;

        if (customMessage) {
            btn.innerText = customMessage;
            return;
        }

        if (downloadProgress.total === 0 && !isDownloading) {
            btn.innerText = 'Extract & Download';
            btn.disabled = false;
            return;
        }
        
        const done = downloadProgress.completed + downloadProgress.failed;
        
        if (done < downloadProgress.total) {
            btn.innerText = `Downloading: ${done}/${downloadProgress.total}`;
            btn.disabled = true; 
        } else if (isDownloading && done === downloadProgress.total) {
            isDownloading = false;
            btn.innerText = `Done! (${downloadProgress.completed} OK, ${downloadProgress.failed} Fail)`;
            btn.disabled = false;
            
            setTimeout(() => {
                if (!isDownloading) {
                    downloadProgress = { total: 0, completed: 0, failed: 0 };
                    updateButtonStatus();
                }
            }, 4000);
        }
    }

    // --- Core: Promise-Wrapped Fetch (Max Quality) ---
    function fetchAndSaveImage(targetSrc, savePath) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: targetSrc,
                responseType: 'blob', 
                headers: {
                    "Referer": window.location.origin + "/"
                },
                onload: function(response) {
                    if (response.status === 200) {
                        const blobUrl = URL.createObjectURL(response.response);
                        
                        GM_download({
                            url: blobUrl,
                            name: savePath,
                            onload: () => {
                                URL.revokeObjectURL(blobUrl);
                                downloadProgress.completed++;
                                updateButtonStatus();
                                resolve();
                            },
                            onerror: (e) => {
                                URL.revokeObjectURL(blobUrl);
                                downloadProgress.failed++;
                                updateButtonStatus();
                                resolve();
                            }
                        });
                    } else {
                        downloadProgress.failed++;
                        updateButtonStatus();
                        resolve();
                    }
                },
                onerror: function(error) {
                    downloadProgress.failed++;
                    updateButtonStatus();
                    resolve();
                }
            });
        });
    }

    // --- Core: Extract ---
    async function extractAndDownload() {
        if (isDownloading) return;

        const config = getCurrentSiteConfig();
        
        if (!config) {
            updateButtonStatus("Error: Site config not found");
            setTimeout(updateButtonStatus, 3000);
            return;
        }

        const containerNodes = document.querySelectorAll(config.container);
        if (containerNodes.length === 0) {
            updateButtonStatus("Error: Comic container missing");
            setTimeout(updateButtonStatus, 3000);
            return;
        }

        let newUrls = [];
        let totalImagesFound = 0;

        containerNodes.forEach((containerNode) => {
            let chapterFolderName = getFolderName(); 
            
            if (config.titleSelector) {
                const titleEl = containerNode.querySelector(config.titleSelector);
                if (titleEl && titleEl.innerText) {
                    chapterFolderName = getFolderName(titleEl.innerText);
                }
            }

            const images = containerNode.querySelectorAll(config.imgSelector);
            totalImagesFound += images.length;

            images.forEach((img, index) => {
                let targetSrc = null;
                
                for (const attr of config.attrs) {
                    const val = img.getAttribute(attr);
                    if (val && val.startsWith('https://')) {
                        targetSrc = val;
                        break;
                    }
                }

                if (targetSrc && !downloadedUrls.has(targetSrc)) {
                    let fileName;

                    if (config.host === 'mangatoon.mobi') {
                        const altText = img.getAttribute('alt') || '';
                        const match = altText.match(/-\s*(\d+)\s*$/);
                        if (match && match[1]) {
                            fileName = `image_${match[1].padStart(3, '0')}.png`; 
                        }
                    }

                    if (!fileName) {
                        fileName = `image_${String(index + 1).padStart(3, '0')}.png`;
                    }

                    newUrls.push({
                        src: targetSrc,
                        path: `${chapterFolderName}/${fileName}` 
                    });
                    
                    downloadedUrls.add(targetSrc);
                }
            });
        });
        
        if (newUrls.length > 0) {
            isDownloading = true;
            downloadProgress = { total: newUrls.length, completed: 0, failed: 0 };
            
            // Inform user exactly what is happening
            updateButtonStatus(`Found ${totalImagesFound}. Queuing ${newUrls.length} new...`);
            
            setTimeout(async () => {
                updateButtonStatus(); 
                
                // Concurrency Queue: Download max 4 images at a time to prevent crashes
                const maxWorkers = 4;
                let currentIndex = 0;

                async function worker() {
                    while (currentIndex < newUrls.length) {
                        const item = newUrls[currentIndex++];
                        await fetchAndSaveImage(item.src, item.path);
                    }
                }

                const workers = [];
                for (let i = 0; i < maxWorkers; i++) {
                    workers.push(worker());
                }

                // Wait for all workers to finish their queues
                await Promise.all(workers);
                
            }, 1200);
            
        } else {
            updateButtonStatus(`Found ${totalImagesFound} imgs. 0 new.`);
            setTimeout(() => {
                updateButtonStatus();
            }, 3000);
        }
    }

    // --- URL Change Detection (For SPAs / Next Chapter Clicks) ---
    function observeURLChanges() {
        let lastUrl = location.href;
        const onUrlChange = () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                // If the user navigates away mid-download, reset UI state
                if (!isDownloading) {
                    downloadProgress = { total: 0, completed: 0, failed: 0 };
                    updateButtonStatus();
                }
            }
        };
        
        window.addEventListener('popstate', onUrlChange);
        
        const hook = (type) => {
            const orig = history[type];
            history[type] = function() {
                const res = orig.apply(this, arguments);
                onUrlChange();
                return res;
            };
        };
        hook('pushState');
        hook('replaceState');
    }

    // --- UI Creation & Drag Logic ---
    function createUI() {
        const container = document.createElement('div');
        container.id = 'gm-ui-container';
        container.style.cssText = `
            position: fixed; top: 45vh; right: 20px; z-index: 999999;
            background: rgba(0, 0, 0, 0.85); padding: 8px; border-radius: 8px;
            display: flex; flex-direction: column; font-family: sans-serif;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            transition: opacity 0.2s; user-select: none; width: 180px;
        `;

        // Empty block specifically for dragging
        const dragHandle = document.createElement('div');
        dragHandle.id = 'gm-drag-handle';
        dragHandle.style.cssText = `
            height: 16px; width: 100%; margin-bottom: 8px; 
            border-radius: 4px; background: rgba(255, 255, 255, 0.15); 
            cursor: grab; display: flex; align-items: center; justify-content: center;
        `;
        
        // Add tiny drag grip lines for visual feedback
        dragHandle.innerHTML = '<div style="width: 30px; height: 2px; background: rgba(255,255,255,0.4); border-radius: 2px; box-shadow: 0 4px 0 rgba(255,255,255,0.4), 0 -4px 0 rgba(255,255,255,0.4);"></div>';

        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'gm-download-btn';
        downloadBtn.innerText = 'Extract & Download';
        downloadBtn.style.cssText = `
            padding: 10px 10px; cursor: pointer; background: #28a745; color: white; 
            border: none; border-radius: 4px; font-weight: bold; font-size: 13px;
            width: 100%;
        `;
        downloadBtn.onclick = extractAndDownload;
        
        container.appendChild(dragHandle);
        container.appendChild(downloadBtn);
        document.body.appendChild(container);

        // --- Drag Implementation ---
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        dragHandle.addEventListener("mousedown", dragStart);
        document.addEventListener("mouseup", dragEnd);
        document.addEventListener("mousemove", drag);

        function dragStart(e) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            dragHandle.style.cursor = 'grabbing';
        }

        function dragEnd() {
            if (!isDragging) return;
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            dragHandle.style.cursor = 'grab';
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        }
    }

    window.addEventListener('load', () => {
        createUI();
        observeURLChanges();
    });

})();