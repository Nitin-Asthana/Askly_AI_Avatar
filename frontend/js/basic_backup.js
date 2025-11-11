// Auto-load latest job's slides/narration on page load
document.addEventListener('DOMContentLoaded', function() {
    fetch('http://localhost:5050/latest_job_id')
        .then(res => res.json())
        .then(data => {
            if (data.job_id) {
                console.log('[Narration Debug] Auto-loading latest job_id:', data.job_id);
                window.pollJobStatusAndLoadNarration(data.job_id);
            } else {
                console.warn('[Narration Debug] No latest job_id found.');
            }
        })
.catch(err => {
    console.error('[Narration Debug] Error fetching latest job_id:', err);
});
});
// --- Poll backend for job status and auto-load narration JSON when ready ---
window.pollJobStatusAndLoadNarration = function(jobId) {
    function poll() {
        console.log('[Narration Debug] Polling job status for jobId:', jobId);
    fetch(`http://localhost:5050/process_status?job_id=${jobId}`)
            .then(res => res.json())
            .then(data => {
                console.log('[Narration Debug] process_status response:', data);
                if (data.status === "done" && data.narration_json_url) {
                    console.log('[Narration Debug] narration_json_url:', data.narration_json_url);
                    fetch(data.narration_json_url)
                        .then(res => {
                            if (!res.ok) throw new Error('Failed to fetch narration JSON: ' + res.status);
                            return res.json();
                        })
                        .then(narrationData => {
                            console.log('[Narration Debug] narration JSON loaded:', narrationData);
                            if (Array.isArray(narrationData)) {
                                window.setNarrationsDataAndShowFirstSlide(narrationData);
                            } else if (Array.isArray(narrationData.narrations)) {
                                window.setNarrationsDataAndShowFirstSlide(narrationData.narrations);
                            } else {
                                console.error('[Narration Debug] Narration JSON format not recognized:', narrationData);
                            }
                        })
                        .catch(err => {
                            console.error('[Narration Debug] Error loading narration JSON:', err);
                        });
                } else if (data.status === "error") {
                    alert("Job failed: " + data.error);
                } else {
                    setTimeout(poll, 2000); // poll again in 2s
                }
            })
            .catch(err => {
                console.error('[Narration Debug] Error polling job status:', err);
                setTimeout(poll, 4000); // try again in 4s
            });
    }
    poll();
};
// --- Auto-load narration JSON and initialize slides on page load ---
// Optionally, you can auto-load a default narration.json as before by uncommenting below:
// document.addEventListener('DOMContentLoaded', function() {
//     const narrationJsonUrl = './narration.json';
//     fetch(narrationJsonUrl)
//         .then(response => {
//             if (!response.ok) throw new Error('Failed to load narration JSON: ' + response.status);
//             return response.json();
//         })
//         .then(data => {
//             if (Array.isArray(data)) {
//                 window.setNarrationsDataAndShowFirstSlide(data);
//             } else if (Array.isArray(data.narrations)) {
//                 window.setNarrationsDataAndShowFirstSlide(data.narrations);
//             } else {
//                 console.error('[Narration Debug] Narration JSON format not recognized:', data);
//             }
//         })
//         .catch(err => {
//             console.error('[Narration Debug] Error loading narration JSON:', err);
//         });
// });
// Slide narration navigation and speaking logic is now handled in basic.html via an inline <script> block.
// Hardcode Azure Speech region and API key on page load
document.addEventListener('DOMContentLoaded', function() {
    // Setup Speak Slide Narration button
    var speakSlideBtn = document.getElementById('speakSlideBtn');
    if (speakSlideBtn) {
        speakSlideBtn.disabled = true;
        speakSlideBtn.addEventListener('click', function() {
            if (window.speakSlideNarration) window.speakSlideNarration();
        });
    }
    // Setup Previous/Next Slide buttons
    var prevBtn = document.getElementById('prevSlideBtn');
    var nextBtn = document.getElementById('nextSlideBtn');
    if (prevBtn) {
        prevBtn.disabled = true;
        prevBtn.addEventListener('click', function() {
            if (window.narrationsData.length > 0 && window.currentSlideIdx > 0) {
                window.currentSlideIdx--;
                showCurrentSlideNarration();
            }
        });
    }
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.addEventListener('click', function() {
            if (window.narrationsData.length > 0 && window.currentSlideIdx < window.narrationsData.length - 1) {
                window.currentSlideIdx++;
                showCurrentSlideNarration();
            }
        });
    }
    document.getElementById('APIKey').value = '3829b0cf6331490c9d4e4c3a5b297b9b';
    document.getElementById('region').value = 'westus2';
    document.getElementById('APIKey').disabled = true;
    document.getElementById('region').disabled = true;
// End of DOMContentLoaded
});
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.

// Global objects
var avatarSynthesizer
var peerConnection
var previousAnimationFrameTimestamp = 0;

// Logger
const log = msg => {
    const loggingDiv = document.getElementById('logging');
    if (loggingDiv) {
        loggingDiv.innerHTML += msg + '<br>';
    } else {
        // Fallback: log to console if #logging is missing
        console.log(msg);
    }
}

// Setup WebRTC
// Pass cogSvcSubKey and cogSvcRegion as parameters for ICE config fetch
async function setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential, cogSvcSubKey, cogSvcRegion, privateEndpointEnabled, privateEndpoint) {
    // Create WebRTC peer connection
    // Use the full iceServers array from Azure relay token response if available
    let iceServers = window.azureIceServersArray;
    if (!iceServers) {
        // Fallback to legacy single-server logic if not set
        iceServers = [{
            urls: [iceServerUrl],
            username: iceServerUsername,
            credential: iceServerCredential
        }];
        // --- Modern async/await ICE config fetch ---
        try {
            let relayUrl;
            let relayHeaders = {
                'Ocp-Apim-Subscription-Key': cogSvcSubKey,
                'Content-Type': 'application/json'
            };
            if (typeof privateEndpointEnabled !== 'undefined' && privateEndpointEnabled) {
                relayUrl = `https://${privateEndpoint}/tts/cognitiveservices/avatar/relay`;
            } else {
                relayUrl = `https://${cogSvcRegion}.tts.speech.microsoft.com/cognitiveservices/avatar/relay`;
            }
            const relayResponse = await fetch(relayUrl, {
                method: 'POST',
                headers: relayHeaders
            });
            if (!relayResponse.ok) {
                throw new Error(`Failed to fetch relay config: ${relayResponse.status} ${relayResponse.statusText}`);
            }
            const relayData = await relayResponse.json();
            console.log('[WebRTC Debug] ICE Config:', relayData);
            if (relayData.iceServers && Array.isArray(relayData.iceServers)) {
                iceServers = relayData.iceServers;
            } else {
                throw new Error('ICE config from Azure did not include iceServers array.');
            }
        } catch (err) {
            console.error('[Avatar Debug] Error fetching ICE servers:', err);
            alert('Failed to fetch ICE servers for avatar connection. Check your Azure resource and network.');
            return;
        }

        // Patch: pass iceServers to setupWebRTC
        window.azureIceServersArray = iceServers;
        // Call setupWebRTC again with all required params
        setupWebRTC(undefined, undefined, undefined, cogSvcSubKey, cogSvcRegion, privateEndpointEnabled, privateEndpoint);
        return;
    }
    peerConnection = new RTCPeerConnection({
        iceServers: iceServers
    });

    // Advanced diagnostics: log all ICE, signaling, and connection state changes
    peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('[WebRTC Debug] ICE Connection State:', peerConnection.iceConnectionState);
    });
    peerConnection.addEventListener('signalingstatechange', () => {
        // ...existing code continues...
    });

    // Patch: Log peer connection errors (if any)
    if (peerConnection.addEventListener) {
        peerConnection.addEventListener('error', (e) => {
            console.error('[WebRTC Debug] PeerConnection error:', e);
        });
    }

    // Patch: Log WebSocket events if accessible (SpeechSDK may use internal WebSocket)
    // Try to monkey-patch SpeechSDK internal WebSocket for diagnostics
    if (window.SpeechSDK && SpeechSDK.WebsocketConnection && !SpeechSDK.WebsocketConnection._patched) {
        const origOpen = SpeechSDK.WebsocketConnection.prototype.open;
        SpeechSDK.WebsocketConnection.prototype.open = function() {
            const ws = origOpen.apply(this, arguments);
            if (ws) {
                ws.addEventListener('close', function(event) {
                    console.warn('[Avatar WebSocket Debug] WebSocket closed:', event, 'code:', event.code, 'reason:', event.reason);
                });
                ws.addEventListener('error', function(event) {
                    console.error('[Avatar WebSocket Debug] WebSocket error:', event);
                });
            }
            return ws;
        };
        SpeechSDK.WebsocketConnection._patched = true;
    }

    // Fetch WebRTC video stream and mount it to an HTML video element
    peerConnection.ontrack = function (event) {
        const remoteVideoDiv = document.getElementById('remoteVideo');
        // Remove any existing video/audio elements of the same kind
        Array.from(remoteVideoDiv.childNodes).forEach(node => {
            if (node.localName === event.track.kind) remoteVideoDiv.removeChild(node);
        });

        // Always create a <video> element for video tracks
        if (event.track.kind === 'video') {
            const videoElem = document.createElement('video');
            videoElem.id = 'avatarVideo';
            videoElem.srcObject = event.streams[0];
            videoElem.autoplay = true;
            videoElem.playsInline = true;
            videoElem.style.width = '100%';
            videoElem.style.height = '100%';
            remoteVideoDiv.appendChild(videoElem);
            window.avatarVideoNode = videoElem;
            // Hide placeholder if present
            const placeholder = document.getElementById('remoteVideoPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            console.log('[Avatar Debug] <video> element created and attached to #remoteVideo. window.avatarVideoNode:', window.avatarVideoNode);
        }
        // Always create an <audio> element for audio tracks
        if (event.track.kind === 'audio') {
            const audioElem = document.createElement('audio');
            audioElem.id = 'avatarAudio';
            audioElem.srcObject = event.streams[0];
            audioElem.autoplay = true;
            audioElem.muted = false;
            audioElem.volume = 1.0;
            remoteVideoDiv.appendChild(audioElem);
            setTimeout(() => {
                audioElem.muted = false;
                audioElem.volume = 1.0;
                console.log('[Avatar Audio Debug] Audio element created, muted:', audioElem.muted, 'volume:', audioElem.volume);
            }, 100);
        }
    };

    // Listen to data channel, to get the event from the server
    peerConnection.addEventListener("datachannel", event => {
        const dataChannel = event.channel
        dataChannel.onmessage = e => {
            console.log("[" + (new Date()).toISOString() + "] WebRTC event received: " + e.data)
        }
    })

    // This is a workaround to make sure the data channel listening is working by creating a data channel from the client side
    c = peerConnection.createDataChannel("eventChannel")

    // Make necessary update to the web page when the connection state changes
    peerConnection.oniceconnectionstatechange = e => {
        log("WebRTC status: " + peerConnection.iceConnectionState)

        if (peerConnection.iceConnectionState === 'connected') {
            document.getElementById('stopSession').disabled = false
            document.getElementById('speak').disabled = false
            var configDiv = document.getElementById('configuration');
            if (configDiv) configDiv.hidden = true;
        }

        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            document.getElementById('speak').disabled = true
            document.getElementById('stopSpeaking').disabled = true
            document.getElementById('stopSession').disabled = true
            document.getElementById('startSession').disabled = false
            var configDiv = document.getElementById('configuration');
            if (configDiv) configDiv.hidden = false;
        }
    }

    // Offer to receive 1 audio, and 1 video track
    peerConnection.addTransceiver('video', { direction: 'sendrecv' })
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' })

    // start avatar, establish WebRTC connection
    avatarSynthesizer.startAvatarAsync(peerConnection).then((r) => {
        if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            console.log("[" + (new Date()).toISOString() + "] Avatar started. Result ID: " + r.resultId)
        } else {
            console.log("[" + (new Date()).toISOString() + "] Unable to start avatar. Result ID: " + r.resultId)
            if (r.reason === SpeechSDK.ResultReason.Canceled) {
                let cancellationDetails = SpeechSDK.CancellationDetails.fromResult(r)
                if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
                    console.log(cancellationDetails.errorDetails)
                };
                log("Unable to start avatar: " + cancellationDetails.errorDetails);
            }
            document.getElementById('startSession').disabled = false;
            var configElem = document.getElementById('configuration');
            if (configElem) configElem.hidden = false;
        }
    }).catch(
        (error) => {
            console.log("[" + (new Date()).toISOString() + "] Avatar failed to start. Error: " + error)
            document.getElementById('startSession').disabled = false
            var configElem2 = document.getElementById('configuration');
            if (configElem2) configElem2.hidden = false
        }
    );
}

// Make video background transparent by matting
function makeBackgroundTransparent(timestamp) {
    // Throttle the frame rate to 30 FPS to reduce CPU usage
    if (timestamp - previousAnimationFrameTimestamp > 30) {
        video = document.getElementById('video')
        tmpCanvas = document.getElementById('tmpCanvas')
        tmpCanvasContext = tmpCanvas.getContext('2d', { willReadFrequently: true })
        tmpCanvasContext.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)
        if (video.videoWidth > 0) {
            let frame = tmpCanvasContext.getImageData(0, 0, video.videoWidth, video.videoHeight)
            for (let i = 0; i < frame.data.length / 4; i++) {
                let r = frame.data[i * 4 + 0]
                let g = frame.data[i * 4 + 1]
                let b = frame.data[i * 4 + 2]
                if (g - 150 > r + b) {
                    // Set alpha to 0 for pixels that are close to green
                    frame.data[i * 4 + 3] = 0
                } else if (g + g > r + b) {
                    // Reduce green part of the green pixels to avoid green edge issue
                    adjustment = (g - (r + b) / 2) / 3
                    r += adjustment
                    g -= adjustment * 2
                    b += adjustment
                    frame.data[i * 4 + 0] = r
                    frame.data[i * 4 + 1] = g
                    frame.data[i * 4 + 2] = b
                    // Reduce alpha part for green pixels to make the edge smoother
                    a = Math.max(0, 255 - adjustment * 4)
                    frame.data[i * 4 + 3] = a
                }
            }

            canvas = document.getElementById('canvas')
            canvasContext = canvas.getContext('2d')
            canvasContext.putImageData(frame, 0, 0);
        }

        previousAnimationFrameTimestamp = timestamp
    }

    window.requestAnimationFrame(makeBackgroundTransparent)
}
// Do HTML encoding on given text
function htmlEncode(text) {
    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
    };

    return String(text).replace(/[&<>"'\/]/g, (match) => entityMap[match])
}

window.startSession = () => {
    var speakSlideBtn = document.getElementById('speakSlideBtn');
    if (speakSlideBtn) speakSlideBtn.disabled = false;
    var prevBtn = document.getElementById('prevSlideBtn');
    var nextBtn = document.getElementById('nextSlideBtn');
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
    const cogSvcRegion = document.getElementById('region').value
    const cogSvcSubKey = document.getElementById('APIKey').value
    if (cogSvcSubKey === '') {
        alert('Please fill in the API key of your speech resource.')
        return
    }

    const privateEndpointEnabled = document.getElementById('enablePrivateEndpoint').checked
    const privateEndpoint = document.getElementById('privateEndpoint').value.slice(8)
    if (privateEndpointEnabled && privateEndpoint === '') {
        alert('Please fill in the Azure Speech endpoint.')
        return
    }

    let speechSynthesisConfig
    if (privateEndpointEnabled) {
        speechSynthesisConfig = SpeechSDK.SpeechConfig.fromEndpoint(new URL(`wss://${privateEndpoint}/tts/cognitiveservices/websocket/v1?enableTalkingAvatar=true`), cogSvcSubKey) 
    } else {
        speechSynthesisConfig = SpeechSDK.SpeechConfig.fromSubscription(cogSvcSubKey, cogSvcRegion)
    }
    const endpointIdInput = document.getElementById('customVoiceEndpointId');
    speechSynthesisConfig.endpointId = endpointIdInput ? endpointIdInput.value : '';

    // Use default video format (no custom crop)
    const videoFormat = new SpeechSDK.AvatarVideoFormat();

    // Get avatar character from dropdown (default to 'lisa')
    const talkingAvatarCharacter = document.getElementById('avatarCharacter')?.value || 'lisa';
    // Set style and voice for Harry, else use defaults
    let talkingAvatarStyle = 'casual-sitting';
    let voiceName = 'en-US-AvaMultilingualNeural';
    if (talkingAvatarCharacter.toLowerCase() === 'Harry' || talkingAvatarCharacter === 'Harry') {
        talkingAvatarStyle = 'business';
        voiceName = 'en-IN-ArjunNeural';
    }
    const avatarConfig = new SpeechSDK.AvatarConfig(talkingAvatarCharacter, talkingAvatarStyle, videoFormat);
    const customizedAvatarInput = document.getElementById('customizedAvatar');
    avatarConfig.customized = customizedAvatarInput && customizedAvatarInput.checked;
    const backgroundColorInput = document.getElementById('backgroundColor');
    avatarConfig.backgroundColor = backgroundColorInput ? backgroundColorInput.value : '#FFFFFFFF';

    // Log all config values for debugging
    console.log('[Avatar Config Debug]');
    console.log('API Key (masked):', cogSvcSubKey ? cogSvcSubKey.slice(0,4) + '...' : '');
    console.log('Region:', cogSvcRegion);
    console.log('Character:', talkingAvatarCharacter);
    console.log('Style:', talkingAvatarStyle);
    console.log('Voice:', voiceName);
    console.log('Background Color:', avatarConfig.backgroundColor);

    avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechSynthesisConfig, avatarConfig);
    avatarSynthesizer.avatarEventReceived = function (s, e) {
        var offsetMessage = ", offset from session start: " + e.offset / 10000 + "ms."
        if (e.offset === 0) {
            offsetMessage = ""
        }
        console.log("[" + (new Date()).toISOString() + "] Event received: " + e.description + offsetMessage)
    }

    document.getElementById('startSession').disabled = true
    
    const xhr = new XMLHttpRequest()
    if (privateEndpointEnabled) {
        xhr.open("GET", `https://${privateEndpoint}/tts/cognitiveservices/avatar/relay/token/v1`)
    } else {
        xhr.open("GET", `https://${cogSvcRegion}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`)
    }
    xhr.setRequestHeader("Ocp-Apim-Subscription-Key", cogSvcSubKey)
    xhr.addEventListener("readystatechange", function() {
        if (this.readyState === 4) {
            try {
                const responseData = JSON.parse(this.responseText);
                console.log('[Avatar Debug] Relay token response:', responseData);
                // Use full iceServers array if present (Azure best practice)
                if (responseData.iceServers && Array.isArray(responseData.iceServers)) {
                    window.azureIceServersArray = responseData.iceServers;
                    setupWebRTC(undefined, undefined, undefined, cogSvcSubKey, cogSvcRegion, privateEndpointEnabled, privateEndpoint);
                } else {
                    // Fallback to legacy fields if not present
                    const iceServerUrl = responseData.Urls ? responseData.Urls[0] : undefined;
                    const iceServerUsername = responseData.Username;
                    const iceServerCredential = responseData.Password;
                    setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential, cogSvcSubKey, cogSvcRegion, privateEndpointEnabled, privateEndpoint);
                }
            } catch (e) {
                console.error('[Avatar Debug] Error parsing relay token response:', this.responseText, e);
            }
        }
    });
    xhr.send();
    
}


// Remove any demo/sample narrationsData assignments and any direct calls to showCurrentSlideNarration.
// Only use window.setNarrationsDataAndShowFirstSlide(yourNarrationsArray) after real data is loaded.

// Dummy function to prevent errors if not needed
function loadAvatarConfigFromNarrationJson() {}

// Update the slide image based on current narration data
function showCurrentSlideNarration() {
    if (window.narrationsData && window.narrationsData.length > 0) {
        const slide = window.narrationsData[window.currentSlideIdx];
        const img = document.getElementById('slideImage');
        if (img) {
            // Support multiple possible property names for image URL
            img.src = slide.image_url || slide.image || slide.image_blob || '';
            console.log('[Slide Debug] Setting slide image to:', img.src, 'for slide idx:', window.currentSlideIdx, 'slide object:', slide);
            if (!img.src) {
                console.warn('[Slide Debug] No image URL found in slide object:', slide);
            }
        } else {
            console.log('[Slide Debug] #slideImage element not found!');
        }
        // Debug narration/SSML
        if (slide.narration || slide.ssml) {
            console.log('[Slide Debug] Narration/SSML for slide:', slide.narration || slide.ssml);
        } else {
            console.warn('[Slide Debug] No narration or SSML found in slide object:', slide);
        }
    } else {
        console.log('[Slide Debug] narrationsData is empty or missing!');
    }
}

// Helper: Call this after loading narration+slide data from blob or any source
window.setNarrationsDataAndShowFirstSlide = function(narrationsArray) {
    window.narrationsData = narrationsArray;
    window.currentSlideIdx = 0;
    // Debug: Log narrations data and first slide image URL
    console.log('[Narration Debug] narrationsData loaded:', window.narrationsData);
    if (window.narrationsData && window.narrationsData.length > 0) {
        const slide = window.narrationsData[0];
        console.log('[Narration Debug] First slide object:', slide);
        console.log('[Narration Debug] First slide image_url:', slide.image_url, 'image:', slide.image, 'image_blob:', slide.image_blob);
        if (slide.narration || slide.ssml) {
            console.log('[Narration Debug] First slide narration/SSML:', slide.narration || slide.ssml);
        } else {
            console.warn('[Narration Debug] First slide has no narration or SSML:', slide);
        }
    } else {
        console.log('[Narration Debug] narrationsData is empty or not set!');
    }
    if (typeof showCurrentSlideNarration === 'function') {
        showCurrentSlideNarration();
    }
}
