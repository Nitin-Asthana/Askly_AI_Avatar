// Global flag to track if this is the initial session start
window.isInitialSessionStart = false;

// Global variables to prevent double narration
window.speechTimeout = null;
window.isSpeechInProgress = false;

// Stop the avatar session and reset UI state
window.stopSession = () => {
    // Reset the initial session start flag
    window.isInitialSessionStart = false;
    
    // Clear any pending speech timeout
    if (window.speechTimeout) {
        clearTimeout(window.speechTimeout);
        window.speechTimeout = null;
    }
    
    // Clear speech in progress flag
    window.isSpeechInProgress = false;
    
    if (window.avatarSynthesizer && typeof window.avatarSynthesizer.close === 'function') {
        window.avatarSynthesizer.close();
    }
    window.avatarSynthesizer = null;
    if (window.peerConnection && typeof window.peerConnection.close === 'function') {
        window.peerConnection.close();
    }
    window.peerConnection = null;
    // Reset UI state properly
    const stopSessionBtn = document.getElementById('stopSession');
    const stopSpeakingBtn = document.getElementById('stopSpeaking');
    const replayBtn = document.getElementById('replaySpeaking');
    const startSessionBtn = document.getElementById('startSession');
    const askAIBtn = document.getElementById('askAI');
    
    if (stopSessionBtn) stopSessionBtn.disabled = true;
    if (stopSpeakingBtn) stopSpeakingBtn.disabled = true;
    if (replayBtn) replayBtn.disabled = true;
    if (startSessionBtn) startSessionBtn.disabled = false;
    if (askAIBtn) askAIBtn.disabled = true;
    
    document.getElementById('configuration').hidden = false;
    // Remove all children from remoteVideo (including placeholder)
    const remoteVideoDiv = document.getElementById('remoteVideo');
    if (remoteVideoDiv) {
        while (remoteVideoDiv.firstChild) {
            remoteVideoDiv.removeChild(remoteVideoDiv.firstChild);
        }
        // Show the avatar placeholder again
        const placeholder = document.createElement('img');
        placeholder.id = 'avatarPlaceholder';
        placeholder.src = 'image/azure.jpg';
        placeholder.alt = 'Azure Placeholder';
        placeholder.style = 'width:100%;height:100%;object-fit:contain;position:absolute;left:0;top:0;z-index:1;background:#fff;';
        remoteVideoDiv.appendChild(placeholder);
        // Hide the Live Video overlay text
        const overlayText = document.getElementById('overlayText');
        if (overlayText) overlayText.style.display = 'none';
    }
};
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.

// Global objects
window.unloadContent = function() {
    var btn = document.getElementById('unloadContentBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Unloading...';
    }
    fetch('http://localhost:5050/unload_content', { method: 'POST' })
        .then(response => {
            if (response.ok) {
                window.location.href = 'ppt_upload.html';
            } else {
                alert('Failed to unload content.');
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = 'Unload Content';
                }
            }
        })
        .catch(() => {
            alert('Failed to unload content.');
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Unload Content';
            }
        });
}
var avatarSynthesizer
var peerConnection
var previousAnimationFrameTimestamp = 0;

// Logger - Console enabled for debugging
const log = msg => {
    // Enable console logging for debugging Ask AI issues
    console.log(msg);
    // Also log to page element if it exists
    const logElem = document.getElementById('logging');
    if (logElem) {
        logElem.innerHTML += msg + '<br>';
    }
}

// Setup WebRTC
function setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential) {
    // Create WebRTC peer connection
    peerConnection = new RTCPeerConnection({
        iceServers: [{
            urls: [ iceServerUrl ],
            username: iceServerUsername,
            credential: iceServerCredential
        }]
    })

    // Fetch WebRTC video stream and mount it to an HTML video element
    peerConnection.ontrack = function (event) {
        // Clean up existing video element if there is any
        let remoteVideoDiv = document.getElementById('remoteVideo');
        // Remove placeholder if present
        const placeholder = document.getElementById('avatarPlaceholder');
        if (placeholder) placeholder.remove();
        for (var i = 0; i < remoteVideoDiv.childNodes.length; i++) {
            if (remoteVideoDiv.childNodes[i].localName === event.track.kind) {
                remoteVideoDiv.removeChild(remoteVideoDiv.childNodes[i])
            }
        }

    const mediaPlayer = document.createElement(event.track.kind)
    mediaPlayer.id = event.track.kind
    mediaPlayer.srcObject = event.streams[0]
    mediaPlayer.autoplay = true
    mediaPlayer.style.position = 'absolute';
    mediaPlayer.style.left = '0';
    mediaPlayer.style.top = '0';
    mediaPlayer.style.width = '100%';
    mediaPlayer.style.height = '100%';
    mediaPlayer.style.objectFit = 'cover'; // More focused/zoomed in
    mediaPlayer.style.background = '#fff';
    remoteVideoDiv.appendChild(mediaPlayer)
    // Always show the Live Video overlay text when avatar is live
    const overlayText = document.getElementById('overlayText');
    if (overlayText) {
        overlayText.style.display = 'block';
        overlayText.style.zIndex = 2;
        overlayText.style.position = 'absolute';
        overlayText.style.left = '8px';
        overlayText.style.top = '8px';
        overlayText.style.background = 'rgba(255,255,255,0.7)';
        overlayText.style.padding = '2px 8px';
        overlayText.style.borderRadius = '8px';
    }
        // document.getElementById('videoLabel').hidden = true // already removed
        document.getElementById('overlayArea').hidden = false

        if (event.track.kind === 'video') {
            mediaPlayer.playsInline = true
            remoteVideoDiv = document.getElementById('remoteVideo')
            let canvas = document.getElementById('canvas')
            if (document.getElementById('transparentBackground').checked) {
                remoteVideoDiv.style.width = '0.1px'
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
                canvas.hidden = false
            } else {
                canvas.hidden = true
            }

            mediaPlayer.addEventListener('play', () => {
                if (document.getElementById('transparentBackground').checked) {
                    window.requestAnimationFrame(makeBackgroundTransparent)
                } else {
                    // Do not resize remoteVideoDiv, keep it fixed for PiP
                }
            })
        }
        else
        {
            // Mute the audio player to make sure it can auto play, will unmute it when speaking
            // Refer to https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide
            mediaPlayer.muted = true
        }
    }

    // Listen to data channel, to get the event from the server
    peerConnection.addEventListener("datachannel", event => {
        const dataChannel = event.channel
        dataChannel.onmessage = e => {
            
            // (Reverted) No longer removing video or showing placeholder on idle/session end
        }
    })

    // This is a workaround to make sure the data channel listening is working by creating a data channel from the client side
    c = peerConnection.createDataChannel("eventChannel")

    // Make necessary update to the web page when the connection state changes
    peerConnection.oniceconnectionstatechange = e => {
        log("WebRTC status: " + peerConnection.iceConnectionState)
        const stopSessionBtn = document.getElementById('stopSession');
        const stopSpeakingBtn = document.getElementById('stopSpeaking');
        const replayBtn = document.getElementById('replaySpeaking');
        const askAIBtn = document.getElementById('askAI');
        
        if (peerConnection.iceConnectionState === 'connected') {
            if (stopSessionBtn) stopSessionBtn.disabled = false;
            if (stopSpeakingBtn) stopSpeakingBtn.disabled = false;
            if (replayBtn) replayBtn.disabled = false;
            if (askAIBtn) askAIBtn.disabled = false;
            document.getElementById('configuration').hidden = true;
            
            // Enable navigation buttons properly
            enableControlButtons();
            
            // Only auto-start speaking on initial session start, not on reconnections
            if (window.isInitialSessionStart) {
                window.isInitialSessionStart = false; // Reset flag after first use
                
                // Auto-start speaking for initial session only (not for reconnections)
                // Clear any existing timeout first
                if (window.speechTimeout) {
                    clearTimeout(window.speechTimeout);
                    window.speechTimeout = null;
                }
                
                window.speechTimeout = setTimeout(() => {
                    autoStartSpeaking();
                }, 1500); // Slightly longer delay for session start
            }
        }
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            if (stopSpeakingBtn) stopSpeakingBtn.disabled = true;
            if (replayBtn) replayBtn.disabled = true;
            if (stopSessionBtn) stopSessionBtn.disabled = true;
            // Keep Ask AI enabled even when avatar is disconnected - user can still ask questions
            // if (askAIBtn) askAIBtn.disabled = true;
            document.getElementById('startSession').disabled = false
            document.getElementById('configuration').hidden = false
            
            // For live demo - show user-friendly message and auto-retry
            log("⚠️ Avatar connection lost. Attempting automatic reconnection...");
            
            // Auto-reconnect after 2 seconds for demo continuity
            setTimeout(() => {
                if (peerConnection && (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed')) {
                    log("🔄 Restarting avatar session for demo continuity...");
                    // Auto-restart the session for seamless demo experience
                    // Pass false to indicate this is NOT an initial session start (no auto-speaking)
                    if (typeof window.startSession === 'function') {
                        window.startSession(false); // Pass false for auto-reconnection
                    }
                }
            }, 2000);
        }
    }

    // Offer to receive 1 audio, and 1 video track
    peerConnection.addTransceiver('video', { direction: 'sendrecv' })
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' })

    // start avatar, establish WebRTC connection
    avatarSynthesizer.startAvatarAsync(peerConnection).then((r) => {
        if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            
        } else {
            
            if (r.reason === SpeechSDK.ResultReason.Canceled) {
                let cancellationDetails = SpeechSDK.CancellationDetails.fromResult(r)
                if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
                    
                };
                log("Unable to start avatar: " + cancellationDetails.errorDetails);
            }
            document.getElementById('startSession').disabled = false;
            document.getElementById('configuration').hidden = false;
        }
    }).catch(
        (error) => {
            
            document.getElementById('startSession').disabled = false
            document.getElementById('configuration').hidden = false
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

window.startSession = (isUserInitiated = true) => {
    // Only set flag for user-initiated session starts, not auto-reconnections
    if (isUserInitiated) {
        window.isInitialSessionStart = true;
    } else {
        window.isInitialSessionStart = false; // Explicitly prevent auto-speaking on reconnection
    }
    
    // Always restore placeholder before session starts
    const remoteVideoDiv = document.getElementById('remoteVideo');
    if (remoteVideoDiv) {
        while (remoteVideoDiv.firstChild) {
            remoteVideoDiv.removeChild(remoteVideoDiv.firstChild);
        }
        const placeholder = document.createElement('img');
        placeholder.id = 'avatarPlaceholder';
        placeholder.src = 'image/azure.jpg';
        placeholder.alt = 'Azure Placeholder';
        placeholder.style = 'width:100%;height:100%;object-fit:cover;position:absolute;left:0;top:0;z-index:1;';
        remoteVideoDiv.appendChild(placeholder);
    }
    // Always disable speak before session starts
    const speakBtn = document.getElementById('speak');
    if (speakBtn) speakBtn.disabled = true;
    // Always reset avatarSynthesizer and peerConnection before starting a new session
    if (window.avatarSynthesizer && typeof window.avatarSynthesizer.close === 'function') {
        window.avatarSynthesizer.close();
    }
    window.avatarSynthesizer = null;
    if (window.peerConnection && typeof window.peerConnection.close === 'function') {
        window.peerConnection.close();
    }
    window.peerConnection = null;
    // Always set hardcoded API key and region before using them
    const apiKeyElement = document.getElementById('APIKey');
    const regionElement = document.getElementById('region');
    
    if (apiKeyElement) apiKeyElement.value = '3829b0cf6331490c9d4e4c3a5b297b9b';
    if (regionElement) regionElement.value = 'westus2';
    
    const cogSvcRegion = regionElement ? regionElement.value : '';
    const cogSvcSubKey = apiKeyElement ? apiKeyElement.value : '';
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
    speechSynthesisConfig.endpointId = document.getElementById('customVoiceEndpointId').value

    const videoFormat = new SpeechSDK.AvatarVideoFormat()
    let videoCropTopLeftX = document.getElementById('videoCrop').checked ? 600 : 0
    let videoCropBottomRightX = document.getElementById('videoCrop').checked ? 1320 : 1920
    videoFormat.setCropRange(new SpeechSDK.Coordinate(videoCropTopLeftX, 0), new SpeechSDK.Coordinate(videoCropBottomRightX, 1080));

    const talkingAvatarCharacter = document.getElementById('talkingAvatarCharacter').value
    const talkingAvatarStyle = document.getElementById('talkingAvatarStyle').value
    const avatarConfig = new SpeechSDK.AvatarConfig(talkingAvatarCharacter, talkingAvatarStyle, videoFormat)
    avatarConfig.customized = document.getElementById('customizedAvatar').checked
    avatarConfig.backgroundColor = document.getElementById('backgroundColor').value
    window.avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechSynthesisConfig, avatarConfig)
    window.avatarSynthesizer.avatarEventReceived = function (s, e) {
        var offsetMessage = ", offset from session start: " + e.offset / 10000 + "ms."
        if (e.offset === 0) {
            offsetMessage = ""
        }
        
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
            const responseData = JSON.parse(this.responseText)
            const iceServerUrl = responseData.Urls[0]
            const iceServerUsername = responseData.Username
            const iceServerCredential = responseData.Password
            setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential)
        }
    })
    xhr.send()
    
}

window.stopSpeaking = () => {
    // Clear any pending speech timeout
    if (window.speechTimeout) {
        clearTimeout(window.speechTimeout);
        window.speechTimeout = null;
    }
    
    // Clear speech in progress flag
    window.isSpeechInProgress = false;
    
    // Immediately disable stop speaking button and enable Ask AI
    const stopSpeakingBtn = document.getElementById('stopSpeaking');
    const askAIBtn = document.getElementById('askAI');
    
    if (stopSpeakingBtn) stopSpeakingBtn.disabled = true;
    if (askAIBtn) askAIBtn.disabled = false;
    
    if (window.avatarSynthesizer) {
        window.avatarSynthesizer.stopSpeakingAsync().then(() => {
            log("[" + (new Date()).toISOString() + "] Stop speaking request sent.");
            // Re-enable buttons after stopping (this will keep Stop Speaking disabled)
            enableControlButtons();
        }).catch((err) => {
            log(err);
            // Re-enable buttons even if stop failed
            enableControlButtons();
        });
    } else {
        log("No avatar synthesizer available");
        // Re-enable buttons if no synthesizer
        enableControlButtons();
    }
}

// Function to disable buttons during speech
function disableControlButtons() {
    const replayBtn = document.getElementById('replaySpeaking');
    const askAIBtn = document.getElementById('askAI');
    const stopSpeakingBtn = document.getElementById('stopSpeaking');
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');
    
    if (replayBtn) replayBtn.disabled = true;
    if (askAIBtn) askAIBtn.disabled = true;
    if (stopSpeakingBtn) stopSpeakingBtn.disabled = false; // Enable stop speaking when avatar is speaking
    
    // Keep navigation buttons enabled during speech for better UX
    // Users should be able to change slides even while avatar is speaking
    if (window.narrationsData && window.narrationsData.length > 1) {
        if (prevBtn) prevBtn.disabled = false; // Keep enabled - let click handler decide behavior
        if (nextBtn) nextBtn.disabled = false; // Keep enabled - let click handler decide behavior
    }
}

// Function to enable buttons after speech ends
function enableControlButtons() {
    const sessionActive = window.peerConnection && window.peerConnection.iceConnectionState === 'connected';
    
    const replayBtn = document.getElementById('replaySpeaking');
    const askAIBtn = document.getElementById('askAI');
    const stopSpeakingBtn = document.getElementById('stopSpeaking');
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');
    
    // Session-dependent buttons (only work when session is active)
    if (sessionActive) {
        if (replayBtn) replayBtn.disabled = false;
        if (askAIBtn) askAIBtn.disabled = false;
        if (stopSpeakingBtn) stopSpeakingBtn.disabled = true; // Disable stop speaking when avatar is not speaking
    } else {
        // When session is not active, disable session-dependent buttons
        if (replayBtn) replayBtn.disabled = true;
        if (askAIBtn) askAIBtn.disabled = true;
        if (stopSpeakingBtn) stopSpeakingBtn.disabled = true;
    }
    
    // Navigation buttons work regardless of session state (as long as we have slides)
    if (window.narrationsData && window.narrationsData.length > 1) {
        if (prevBtn) prevBtn.disabled = false; // Always enable previous button - let click handler decide behavior
        if (nextBtn) nextBtn.disabled = false; // Always enable next button - let click handler decide behavior
    }
}

// Replay current slide's speech
window.replaySpeaking = () => {
    if (window.avatarSynthesizer) {
        // Clear any pending speech timeout
        if (window.speechTimeout) {
            clearTimeout(window.speechTimeout);
            window.speechTimeout = null;
        }
        
        // Clear speech in progress flag
        window.isSpeechInProgress = false;
        
        // Stop any current speech first, then start new speech
        window.avatarSynthesizer.stopSpeakingAsync().then(() => {
            // Wait a brief moment after stopping, then start the current slide speech
            setTimeout(() => {
                autoStartSpeaking();
            }, 300);
        }).catch(() => {
            // Even if stop fails, try to start speech after a brief delay
            setTimeout(() => {
                autoStartSpeaking();
            }, 300);
        });
    } else {
        // No synthesizer - just try to start speech
        autoStartSpeaking();
    }
}

// Auto-start speaking function
function autoStartSpeaking() {
    // Check if session is active and narration exists
    const sessionActive = window.peerConnection && window.peerConnection.iceConnectionState === 'connected';
    if (!sessionActive || !window.avatarSynthesizer) {
        return;
    }
    
    // Prevent concurrent speech
    if (window.isSpeechInProgress) {
        return;
    }
    
    if (window.narrationsData && typeof window.currentSlideIdx === 'number') {
        let slide = window.narrationsData[window.currentSlideIdx];
        let spokenText = slide && (slide.narration || slide.ssml || '');
        
        if (spokenText) {
            
            // Set speech in progress flag
            window.isSpeechInProgress = true;
            
            // Disable buttons while speaking
            disableControlButtons();
            
            var audioElem = document.getElementById('audio');
            if (audioElem) audioElem.muted = false;
            
            let ttsVoice = document.getElementById('ttsVoice').value
            let personalVoiceSpeakerProfileID = document.getElementById('personalVoiceSpeakerProfileID').value
            let spokenSsml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${ttsVoice}'><mstts:ttsembedding speakerProfileId='${personalVoiceSpeakerProfileID}'><mstts:leadingsilence-exact value='0'/>${htmlEncode(spokenText)}</mstts:ttsembedding></voice></speak>`
            
            window.avatarSynthesizer.speakSsmlAsync(spokenSsml).then(
                (result) => {
                    // Clear speech in progress flag
                    window.isSpeechInProgress = false;
                    
                    // Re-enable buttons when speech completes
                    enableControlButtons();
                    
                    if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                        
                    } else {
                        
                        if (result.reason === SpeechSDK.ResultReason.Canceled) {
                            let cancellationDetails = SpeechSDK.CancellationDetails.fromResult(result)
                            
                            if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
                                
                            }
                        }
                    }
                }).catch((err) => {
                    // Clear speech in progress flag even if speech failed
                    window.isSpeechInProgress = false;
                    
                    // Re-enable buttons even if speech failed
                    enableControlButtons();
                    log("Auto-speech error: " + err);
                });
        }
    }
}

// --- Avatar Health Check Indicator ---

// One-time health check on page load
window.addEventListener('DOMContentLoaded', function() {
    fetch('http://localhost:5050/api/health')
        .then(resp => resp.json())
        .then(data => {
            const healthDot = document.getElementById('avatarHealthDot');
            if (healthDot) {
                if (data.status === 'ok') {
                    healthDot.style.background = 'green';
                    healthDot.title = 'Avatar backend healthy';
                } else {
                    healthDot.style.background = 'red';
                    healthDot.title = 'Avatar backend not healthy';
                }
            }
        })
        .catch(() => {
            const healthDot = document.getElementById('avatarHealthDot');
            if (healthDot) {
                healthDot.style.background = 'red';
                healthDot.title = 'Avatar backend not healthy';
            }
        });
});

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

// In showCurrentSlideNarration, after stopSpeakingAsync, always reset buttons
function showCurrentSlideNarration(shouldAutoSpeak = false) {
    
    // FAILSAFE: Ensure currentSlideIdx is within bounds
    if (window.narrationsData && window.narrationsData.length > 0) {
        if (typeof window.currentSlideIdx !== 'number' || window.currentSlideIdx < 0) {
            window.currentSlideIdx = 0;
        }
        if (window.currentSlideIdx >= window.narrationsData.length) {
            window.currentSlideIdx = 0;
        }
    }
    
    // Clear any pending speech timeout
    if (window.speechTimeout) {
        clearTimeout(window.speechTimeout);
        window.speechTimeout = null;
    }
    
    // Clear speech in progress flag
    window.isSpeechInProgress = false;
    
    // Stop any ongoing speech and wait before starting new speech
    if (window.avatarSynthesizer && typeof window.avatarSynthesizer.stopSpeakingAsync === 'function') {
        window.avatarSynthesizer.stopSpeakingAsync().then(() => {
            // Wait a brief moment after stopping before allowing new speech
            setTimeout(() => {
                // Proceed with slide update after speech is properly stopped
                updateSlideContent(shouldAutoSpeak); // Pass through the shouldAutoSpeak parameter
            }, 200);
        }).catch(() => {
            // Even if stop fails, proceed with slide update after a brief delay
            setTimeout(() => {
                updateSlideContent(shouldAutoSpeak); // Pass through the shouldAutoSpeak parameter
            }, 200);
        });
    } else {
        // No ongoing speech - proceed immediately
        updateSlideContent(shouldAutoSpeak); // Pass through the shouldAutoSpeak parameter
    }
    
    function updateSlideContent(shouldAutoSpeak = false) {
    
    if (window.narrationsData && window.narrationsData.length > 0) {
        var slide = window.narrationsData[window.currentSlideIdx];
        
        // Always update or clear slide image with fast loading handling
        var imgElem = document.getElementById('slideImage');
        if (imgElem) {
            if (slide.image_url) {
                
                // Update image source immediately for faster response
                imgElem.src = slide.image_url;
                imgElem.style.display = 'block';
                imgElem.style.opacity = '1';
                imgElem.style.filter = 'contrast(1.1) brightness(1.05)';
                
                // Only start speech if explicitly requested (user navigation)
                if (shouldAutoSpeak && !window.speechTimeout) {
                    window.speechTimeout = setTimeout(() => {
                        autoStartSpeaking();
                    }, 1000); // Back to 1000ms as requested
                }
                
            } else {
                imgElem.src = '';
                imgElem.style.display = 'none';
                imgElem.style.opacity = '1';
                imgElem.style.filter = 'contrast(1.1) brightness(1.05)';
            }
        }
        // Use narration text from JSON for SSML and speaking
        var narrationText = slide.narration || slide.ssml || '';
        var spokenTextElem = document.getElementById('spokenText');
        if (spokenTextElem) spokenTextElem.value = narrationText;
    } else {
        
    }
    } // Close updateSlideContent function
} // Close showCurrentSlideNarration function
