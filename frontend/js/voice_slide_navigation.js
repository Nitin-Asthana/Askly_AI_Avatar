// Voice Slide Navigation - Separate from Ask AI functionality
// Always-on voice listener for slide navigation commands only

class VoiceSlideNavigator {
    constructor() {
        console.log('Voice nav: Constructor starting...');
        
        this.recognition = null;
        this.isListening = false;
        this.isEnabled = true;
        this.voiceEnabled = true; // Voice toggle state - enabled by default
        this.lastSpeechState = false; // Track previous speech state
        this.shouldIgnoreResults = false; // Flag to ignore buffered results
        this.recentlyStoppedSpeaking = false; // Track recent Stop Speaking clicks
        this.isProtectedFromDestruction = false; // Flag to prevent destruction during initialization
        this.isAvatarInitializing = false; // Flag to track avatar session initialization
        this.speechTimeoutMs = 15000; // Extended timeout for better voice interaction (15 seconds)
        this.speechTimeoutId = null; // For managing custom speech timeouts
        
        // Voice commands for slide navigation and session control - organized to prevent conflicts
        this.commands = {
            next: ['next slide', 'go to next slide', 'go to next', 'move to next slide', 'show next slide', 'next', 'forward', 'continue'],
            previous: ['previous slide', 'go to previous slide', 'go to previous', 'move to previous slide', 'show previous slide', 'go back slide', 'previous', 'back', 'go back'],
            first: ['go to first slide', 'show first slide', 'go to beginning', 'first slide', 'go to first', 'beginning', 'first'],
            last: ['go to last slide', 'show last slide', 'go to end', 'last slide', 'go to last', 'final', 'last'],
            // Session control commands
            startSession: ['start session', 'begin session', 'start presentation', 'begin presentation', 'start avatar', 'begin avatar'],
            stopSession: ['stop session', 'end session', 'stop presentation', 'end presentation', 'stop', 'end'],
            replay: ['replay', 'replay slide', 'repeat', 'repeat slide', 'play again', 'say again'],
            // Ask AI commands - simplified for better recognition
            askAI: ['question', 'one question', 'I have a question']
        };
        
        this.setupVoiceRecognition();
        this.startListening();
        this.monitorSpeechState();
        
        // Initialize voice toggle UI state
        setTimeout(() => {
            this.updateVoiceToggleUI();
        }, 100);
        
        console.log('Voice nav: Constructor completed successfully');
    }
    
    setupVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            return;
        }
        
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        
        // Optimize for short commands
        this.recognition.maxAlternatives = 1;
        
        this.recognition.onresult = (event) => {
            // ULTIMATE SAFETY: If recognition was destroyed, ignore ALL results
            if (!this.recognition || this.recognition !== event.target) {
                console.log('Voice nav: IGNORING result from destroyed/old recognition instance');
                return;
            }
            
            // Reset speech timeout when we get results (for continuous listening)
            if (this.speechTimeoutId) {
                clearTimeout(this.speechTimeoutId);
                this.speechTimeoutId = setTimeout(() => {
                    if (this.recognition && this.isListening) {
                        console.log('Voice nav: Custom speech timeout reached, stopping recognition');
                        this.recognition.stop();
                    }
                }, this.speechTimeoutMs);
            }
            
            const result = event.results[event.results.length - 1][0];
            const transcript = result.transcript.toLowerCase().trim();
            
            // MULTIPLE LAYERS OF PROTECTION - Block if ANY condition suggests we shouldn't process
            const blockReasons = [];
            
            if (this.shouldIgnoreResults) blockReasons.push('ignore flag set');
            if (window.isSpeechInProgress === true) blockReasons.push('avatar speaking');
            if (!this.isEnabled) blockReasons.push('not enabled');
            if (!this.voiceEnabled) blockReasons.push('voice disabled');
            
            const askAIBtn = document.getElementById('askAI');
            if (askAIBtn) {
                const btnText = askAIBtn.textContent;
                if (btnText.includes('Stop Speaking')) blockReasons.push('ask AI stop speaking');
                if (btnText.includes('Processing')) blockReasons.push('ask AI processing');
                if (btnText.includes('Listening')) blockReasons.push('ask AI listening');
                
                // EXTRA: Also block if Ask AI button was recently "Stop Speaking"
                if (btnText.includes('Ask AI') && this.recentlyStoppedSpeaking) {
                    blockReasons.push('recently stopped speaking');
                }
            }
            
            // If ANY blocking condition exists, reject the result
            if (blockReasons.length > 0) {
                console.log(`Voice nav: BLOCKED result "${transcript}" - Reasons: ${blockReasons.join(', ')}`);
                return;
            }
            
            // Only process if we pass all checks
            if (transcript && this.shouldProcessCommands()) {
                this.processNavigationCommand(transcript);
            } else if (transcript) {
                console.log(`Voice nav: Ignored "${transcript}" - conditions not met`);
            }
        };
        
        this.recognition.onerror = (event) => {
            // Ignore errors from destroyed instances
            if (!this.recognition) {
                console.log('Voice nav: Ignoring error from destroyed recognition instance');
                return;
            }
            
            console.log('Voice nav error:', event.error);
            
            // If we get an "aborted" error, it's likely because Ask AI took over
            if (event.error === 'aborted') {
                console.log('Voice nav: Recognition aborted (likely Ask AI conflict)');
                this.isListening = false;
                this.shouldIgnoreResults = true;
                
                // Don't try to restart immediately - let Ask AI have precedence
                setTimeout(() => {
                    if (!this.isAskAIActive() && !window.isSpeechInProgress) {
                        this.shouldIgnoreResults = false;
                    }
                }, 2000);
            }
            // For other errors, just mark as not listening
            else {
                this.isListening = false;
            }
        };
        
        this.recognition.onend = () => {
            // Ignore end events from destroyed instances
            if (!this.recognition) {
                console.log('Voice nav: Ignoring end event from destroyed recognition instance');
                return;
            }
            
            this.isListening = false;
            
            // Clear speech timeout if it exists
            if (this.speechTimeoutId) {
                clearTimeout(this.speechTimeoutId);
                this.speechTimeoutId = null;
            }
            
            // If we ended while we should be ignoring results, clear the ignore flag after a delay
            if (this.shouldIgnoreResults) {
                setTimeout(() => {
                    this.shouldIgnoreResults = false;
                    console.log('Voice nav: Cleared ignore flag after recognition ended');
                }, 1000);
            }
            
            // Auto-restart immediately if we should be listening and Ask AI is not active
            const askAIBtn = document.getElementById('askAI');
            const btnText = askAIBtn ? askAIBtn.textContent : '';
            const askAIActive = btnText.includes('Listening') || 
                              btnText.includes('Processing') || 
                              btnText.includes('Stop Speaking') ||
                              btnText.includes('Stop Listening');
            
            if (this.isEnabled && !askAIActive && !this.shouldIgnoreResults && this.recognition) {
                // Immediate restart - no delay
                setTimeout(() => {
                    if (this.recognition && this.isEnabled && !this.isListening && !this.shouldIgnoreResults) {
                        const currentBtn = document.getElementById('askAI');
                        const currentText = currentBtn ? currentBtn.textContent : '';
                        const stillNotActive = !currentText.includes('Listening') && 
                                             !currentText.includes('Processing') && 
                                             !currentText.includes('Stop Speaking') &&
                                             !currentText.includes('Stop Listening');
                        
                        if (stillNotActive && !window.isSpeechInProgress) {
                            try {
                                this.recognition.start();
                                this.isListening = true;
                                console.log('Voice nav: Auto-restarted recognition after timeout');
                            } catch (e) {
                                console.log('Voice nav: Failed to auto-restart recognition:', e.message);
                            }
                        } else {
                            console.log('Voice nav: Skipped restart - conditions not met');
                        }
                    }
                }, 50); // Minimal delay just for browser processing
            }
        };
        
        this.recognition.onstart = () => {
            // Clear any existing timeout
            if (this.speechTimeoutId) {
                clearTimeout(this.speechTimeoutId);
            }
            
            // Set custom speech timeout for extended recognition
            this.speechTimeoutId = setTimeout(() => {
                if (this.recognition && this.isListening) {
                    console.log('Voice nav: Custom speech timeout reached, stopping recognition for restart');
                    this.recognition.stop(); // This will trigger onend which should restart
                }
            }, this.speechTimeoutMs);
        };
    }
    
    shouldProcessCommands() {
        // Always block commands if not enabled
        if (!this.isEnabled) return false;
        
        // CRITICAL: Block and force stop if Ask AI is active
        if (this.isAskAIActive()) {
            // Force stop our recognition to let Ask AI have it
            if (this.isListening && this.recognition) {
                this.recognition.stop();
                this.isListening = false;
                this.shouldIgnoreResults = true;
                console.log('Voice nav: Emergency stop for Ask AI');
            }
            return false;
        }
        
        // Block if avatar is speaking
        if (window.isSpeechInProgress === true) {
            return false;
        }
        
        return true;
    }
    
    processNavigationCommand(transcript) {
        let commandExecuted = false;
        
        // Show what we heard for debugging - DISABLED TO PREVENT VISUAL INDICATORS
        // this.showCommandFeedback(`Heard: "${transcript}"`);
        console.log('Voice nav: Heard (visual feedback disabled):', transcript);
        
        // Process commands in order of specificity (longer phrases first to avoid conflicts)
        
        // Ask AI commands (highest priority to prevent conflicts)
        if (this.matchesAnyCommand(transcript, this.commands.askAI)) {
            this.executeAskAI();
            commandExecuted = true;
        }
        
        // Session control commands
        if (this.matchesAnyCommand(transcript, this.commands.startSession)) {
            this.executeStartSession();
            commandExecuted = true;
        }
        else if (this.matchesAnyCommand(transcript, this.commands.stopSession)) {
            this.executeStopSession();
            commandExecuted = true;
        }
        else if (this.matchesAnyCommand(transcript, this.commands.replay)) {
            this.executeReplay();
            commandExecuted = true;
        }
        
        // Navigation commands
        // Check for first slide commands first (to prevent "first" being caught by other commands)
        else if (this.matchesAnyCommand(transcript, this.commands.first)) {
            this.executeFirstSlide();
            commandExecuted = true;
        }
        // Check for last slide commands
        else if (this.matchesAnyCommand(transcript, this.commands.last)) {
            this.executeLastSlide();
            commandExecuted = true;
        }
        // Check for previous slide commands
        else if (this.matchesAnyCommand(transcript, this.commands.previous)) {
            this.executePreviousSlide();
            commandExecuted = true;
        }
        // Check for next slide commands
        else if (this.matchesAnyCommand(transcript, this.commands.next)) {
            this.executeNextSlide();
            commandExecuted = true;
        }
        
        if (commandExecuted) {
            // this.showCommandFeedback(`Executed: ${transcript}`);
            console.log('Voice nav: Executed (visual feedback disabled):', transcript);
        } else {
            // Show unrecognized commands for debugging
            // this.showCommandFeedback(`Not recognized: "${transcript}"`);
            console.log('Voice nav: Not recognized (visual feedback disabled):', transcript);
        }
    }
    
    matchesAnyCommand(transcript, commandList) {
        // More precise matching - check for exact phrases or word boundaries
        // This prevents partial matches and cross-command confusion
        return commandList.some(command => {
            // For single words like "next", "back", "start", "end" - check word boundaries
            if (command.split(' ').length === 1) {
                const regex = new RegExp(`\\b${command}\\b`, 'i');
                return regex.test(transcript);
            }
            // For phrases, use contains but be more strict
            else {
                return transcript.includes(command);
            }
        });
    }
    
    executeNextSlide() {
        // Slide navigation works as soon as slides are loaded (no session required)
        if (window.narrationsData && window.currentSlideIdx < window.narrationsData.length - 1) {
            window.currentSlideIdx++;
            if (typeof showCurrentSlideNarration === 'function') {
                showCurrentSlideNarration(true); // Enable auto-speak for voice navigation
            }
        }
    }
    
    executePreviousSlide() {
        // Slide navigation works as soon as slides are loaded (no session required)
        if (window.narrationsData && window.currentSlideIdx > 0) {
            window.currentSlideIdx--;
            if (typeof showCurrentSlideNarration === 'function') {
                showCurrentSlideNarration(true); // Enable auto-speak for voice navigation
            }
        }
    }
    
    executeFirstSlide() {
        // Slide navigation works as soon as slides are loaded (no session required)
        if (window.narrationsData && window.narrationsData.length > 0) {
            window.currentSlideIdx = 0;
            if (typeof showCurrentSlideNarration === 'function') {
                showCurrentSlideNarration(true);
            }
        }
    }
    
    executeLastSlide() {
        // Slide navigation works as soon as slides are loaded (no session required)
        if (window.narrationsData && window.narrationsData.length > 0) {
            window.currentSlideIdx = window.narrationsData.length - 1;
            if (typeof showCurrentSlideNarration === 'function') {
                showCurrentSlideNarration(true);
            }
        }
    }
    
    executeStartSession() {
        // Check if start session button is available and enabled
        const startBtn = document.getElementById('startSession');
        if (startBtn && !startBtn.disabled) {
            // Check if we're already in a throttled state
            const recentlyThrottled = this.checkForRecentThrottling();
            if (recentlyThrottled) {
                // this.showCommandFeedback('Azure throttling detected. Please use manual Start Session button.');
                console.log('Voice nav: Azure throttling detected (visual feedback disabled)');
                console.log('Voice nav: Skipping voice start session due to recent throttling');
                return;
            }
            
            // Show visual feedback that we're starting
            // this.showCommandFeedback('Starting avatar session... Mic will be disabled until avatar is ready.');
            console.log('Voice nav: Starting avatar session (visual feedback disabled)');
            
            // Indicator functionality completely removed
            
            // COMPLETE MIC SHUTDOWN during session start
            this.isProtectedFromDestruction = true;
            this.shouldIgnoreResults = true;
            this.isAvatarInitializing = true; // New flag to track avatar initialization
            
            // Completely destroy current recognition to free up mic
            this.destroyRecognition();
            console.log('Voice nav: COMPLETE MIC SHUTDOWN for avatar session start');
            
            // Use button click to maintain exact same flow as manual interaction
            startBtn.click();
            console.log('Voice nav: Executed Start Session (button click for consistency)');
            
            // Wait a moment for the button click event to fully process before monitoring
            setTimeout(() => {
                this.monitorAvatarInitialization();
            }, 500); // Small delay to ensure button click fully processes
            
        } else {
            console.log('Voice nav: Start Session button not available or disabled');
            // this.showCommandFeedback('Start Session not available');
            console.log('Voice nav: Start Session not available (visual feedback disabled)');
        }
    }
    
    monitorAvatarInitialization() {
        let checkCount = 0;
        const maxChecks = 40; // 20 seconds max wait (500ms * 40)
        let hasSpokenOnce = false; // Track if avatar has spoken at least once
        
        const checkAvatarReady = () => {
            checkCount++;
            
            // Check if avatar is visible and ready
            const sessionActive = window.peerConnection && window.peerConnection.iceConnectionState === 'connected';
            const hasAvatarVideo = document.getElementById('avatarVideo') !== null || 
                                 document.querySelector('#remoteVideo video') !== null ||
                                 document.querySelector('video[id*="avatar"]') !== null;
            const isAvatarSpeaking = window.isSpeechInProgress === true;
            
            console.log(`Voice nav: Avatar check ${checkCount}: Session=${sessionActive}, Video=${hasAvatarVideo}, Speaking=${isAvatarSpeaking}`);
            
            // Debug: Log what video elements exist
            const allVideos = document.querySelectorAll('video');
            const remoteVideoDiv = document.getElementById('remoteVideo');
            console.log(`Voice nav: Found ${allVideos.length} video elements, remoteVideo div exists: ${remoteVideoDiv !== null}`);
            if (allVideos.length > 0) {
                allVideos.forEach((vid, idx) => {
                    console.log(`Voice nav: Video ${idx}: id="${vid.id}", src="${vid.src}", srcObject=${vid.srcObject !== null}`);
                });
            }
            
            // Track if avatar has started speaking
            if (isAvatarSpeaking) {
                hasSpokenOnce = true;
                console.log('Voice nav: Avatar has started speaking');
            }
            
            // Avatar is ready when it's connected, visible, HAS spoken, and FINISHED speaking
            if (sessionActive && hasAvatarVideo && hasSpokenOnce && !isAvatarSpeaking && checkCount > 10) {
                // Avatar is ready and has completed initial speech
                this.completeAvatarInitialization(true);
                return;
            }
            
            // Continue checking if we haven't exceeded max checks
            if (checkCount < maxChecks) {
                setTimeout(checkAvatarReady, 500); // Check every 500ms
            } else {
                // Timeout - re-enable mic even if avatar didn't fully initialize
                console.log('Voice nav: Avatar initialization timeout - re-enabling mic anyway');
                this.completeAvatarInitialization(false);
            }
        };
        
        // Start checking after a brief delay
        setTimeout(checkAvatarReady, 2000); // Start checking after 2 seconds
    }
    
    completeAvatarInitialization(success) {
        this.isAvatarInitializing = false;
        this.isProtectedFromDestruction = false;
        this.shouldIgnoreResults = false;
        
        console.log('Voice nav: Avatar initialization complete, re-enabling voice recognition');
        
        // Show feedback based on success
        if (success) {
            // this.showCommandFeedback('Avatar ready! Voice navigation restored. All commands available.');
            console.log('Voice nav: Avatar ready! (visual feedback disabled)');
        } else {
            // this.showCommandFeedback('Session timeout. Voice navigation restored. Try manual start if needed.');
            console.log('Voice nav: Session timeout (visual feedback disabled)');
        }
        
        // Recreate recognition and restart listening
        if (!this.recognition && this.isEnabled) {
            this.setupVoiceRecognition();
            setTimeout(() => {
                if (!window.isSpeechInProgress && !this.isAskAIActive() && !this.isListening) {
                    try {
                        this.recognition.start();
                        this.isListening = true;
                        console.log('Voice nav: Successfully restarted voice recognition after avatar initialization');
                    } catch (e) {
                        console.log('Voice nav: Failed to restart recognition after avatar init:', e.message);
                    }
                }
            }, 1000);
        } else if (this.recognition && this.isEnabled && !this.isListening) {
            // Recognition exists but not listening - just start it
            setTimeout(() => {
                if (!window.isSpeechInProgress && !this.isAskAIActive() && !this.isListening) {
                    try {
                        this.recognition.start();
                        this.isListening = true;
                        console.log('Voice nav: Restarted existing recognition after avatar initialization');
                    } catch (e) {
                        console.log('Voice nav: Failed to restart existing recognition:', e.message);
                    }
                }
            }, 1000);
        }
        
        // Indicator functionality completely removed
    }
    
    checkForRecentThrottling() {
        // Simple check for recent throttling by looking at recent console logs
        // This is a basic heuristic - in production you'd want more sophisticated tracking
        return false; // For now, always allow - but with better error handling
    }
    
    executeStopSession() {
        // Check if stop session button is available and enabled
        const stopBtn = document.getElementById('stopSession');
        if (stopBtn && !stopBtn.disabled) {
            // Call the function directly instead of clicking the button
            if (typeof window.stopSession === 'function') {
                window.stopSession();
                console.log('Voice nav: Executed Stop Session (direct function call)');
            } else {
                // Fallback to button click if function not available
                stopBtn.click();
                console.log('Voice nav: Executed Stop Session (button click)');
            }
        } else {
            console.log('Voice nav: Stop Session button not available');
        }
    }
    
    executeReplay() {
        // Check if replay button is available and enabled
        const replayBtn = document.getElementById('replaySpeaking');
        if (replayBtn && !replayBtn.disabled) {
            // Call the function directly instead of clicking the button
            if (typeof window.replaySpeaking === 'function') {
                window.replaySpeaking();
                console.log('Voice nav: Executed Replay (direct function call)');
            } else {
                // Fallback to button click if function not available
                replayBtn.click();
                console.log('Voice nav: Executed Replay (button click)');
            }
        } else {
            console.log('Voice nav: Replay button not available');
        }
    }
    
    executeAskAI() {
        // Ask AI only works when avatar session is active (after Start Session)
        const sessionActive = window.peerConnection && window.peerConnection.iceConnectionState === 'connected';
        if (!sessionActive) {
            console.log('Voice nav: Ask AI blocked - no active avatar session');
            // this.showCommandFeedback('Ask AI requires active session');
            console.log('Voice nav: Ask AI requires active session (visual feedback disabled)');
            return;
        }
        
        // Check if Ask AI button is available and enabled
        const askAIBtn = document.getElementById('askAI');
        if (askAIBtn && !askAIBtn.disabled) {
            // Temporarily protect from destruction during Ask AI activation
            this.isProtectedFromDestruction = true;
            this.shouldIgnoreResults = true;
            console.log('Voice nav: PROTECTED from destruction during Ask AI activation');
            
            // First, properly stop our recognition to release the microphone
            if (this.recognition && this.isListening) {
                this.recognition.stop();
                this.isListening = false;
                console.log('Voice nav: Stopped recognition to release microphone for Ask AI');
            }
            
            // Wait a longer moment for microphone to be completely released, then start Ask AI
            setTimeout(() => {
                // Call the function directly instead of clicking the button
                if (typeof window.askAI === 'function') {
                    window.askAI();
                    console.log('Voice nav: Executed Ask AI (direct function call)');
                } else {
                    // Fallback to button click if function not available
                    askAIBtn.click();
                    console.log('Voice nav: Executed Ask AI (button click)');
                }
                
                // Wait for Ask AI to start listening, then remove protection
                setTimeout(() => {
                    this.isProtectedFromDestruction = false;
                    console.log('Voice nav: REMOVED protection - Ask AI should now be listening');
                    
                    // Ask AI will handle the speech recognition from here
                    // Voice navigation will stay disabled until Ask AI finishes
                }, 1000); // 1 second delay to allow Ask AI to start
                
            }, 1500); // Increased to 1.5 seconds to ensure microphone is fully released
            
        } else {
            console.log('Voice nav: Ask AI button not available or disabled');
            // this.showCommandFeedback('Ask AI not available');
            console.log('Voice nav: Ask AI not available (visual feedback disabled)');
        }
    }
    
    startListening() {
        if (!this.recognition) return;
        
        this.isListening = true;
        try {
            this.recognition.start();
        } catch (e) {
            // Ignore if already running
        }
    }
    
    stopListening() {
        this.isListening = false;
        
        // Clear speech timeout
        if (this.speechTimeoutId) {
            clearTimeout(this.speechTimeoutId);
            this.speechTimeoutId = null;
        }
        
        if (this.recognition) {
            this.recognition.stop();
        }
    }
    
    addVisualIndicator() {
        // Indicator functionality completely removed
        console.log('Voice nav: Visual indicator disabled');
    }
    
    removeAllIndicators() {
        // Aggressively remove any existing voice navigation indicators
        const selectors = [
            '#voiceNavIndicator',
            '[id*="voiceNav"]',
            '[class*="voice-indicator"]', 
            '[class*="voiceIndicator"]',
            'div[style*="voice"]',
            '[title*="Voice Navigation"]',
            'div[style*="position: fixed"]', // Check fixed position elements that might be indicators
            'div[style*="position: absolute"]' // Check absolute position elements
        ];
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                // Additional check for suspicious indicators
                if (element.style.position === 'fixed' || element.style.position === 'absolute') {
                    // Check if it's in typical indicator positions (corners, etc.)
                    const rect = element.getBoundingClientRect();
                    const isInCorner = (rect.right > window.innerWidth - 100 && rect.top < 100) || 
                                      (rect.left < 100 && rect.top < 100) ||
                                      (rect.right > window.innerWidth - 100 && rect.bottom > window.innerHeight - 100);
                    
                    if (isInCorner && (element.innerHTML.includes('🎤') || element.innerHTML.includes('Voice') || element.innerHTML.includes('Mic'))) {
                        element.remove();
                        console.log('Voice nav: Removed positioned indicator:', selector);
                        return;
                    }
                }
                
                // Remove any element with voice-related content
                if (element.innerHTML && 
                    (element.innerHTML.includes('🎤') || 
                     element.innerHTML.includes('Voice Navigation') ||
                     element.innerHTML.includes('Microphone') ||
                     element.title && element.title.includes('Voice'))) {
                    element.remove();
                    console.log('Voice nav: Removed indicator element:', selector);
                }
            });
        });
        
        // Also check for any dynamically created indicators that might have been added
        const allDivs = document.querySelectorAll('div');
        allDivs.forEach(div => {
            if (div.innerHTML && (
                div.innerHTML.includes('🎤') || 
                div.innerHTML.includes('Voice Navigation') ||
                div.innerHTML.includes('Voice commands') ||
                div.innerHTML.includes('Speak now') ||
                div.innerHTML.includes('Microphone')
            )) {
                // Double check it's not the voice toggle (which should stay)
                if (!div.closest('.voice-toggle-container') && 
                    !div.id.includes('voiceToggle') && 
                    !div.className.includes('voice-toggle')) {
                    div.remove();
                    console.log('Voice nav: Removed suspicious indicator div');
                }
            }
            
            // NUCLEAR OPTION: Remove any small floating div that looks like an indicator
            const style = window.getComputedStyle(div);
            const isFloating = (style.position === 'fixed' || style.position === 'absolute');
            const isSmall = (div.offsetWidth < 200 && div.offsetHeight < 100);
            const hasIndicatorColors = (
                style.backgroundColor.includes('rgb(76, 175, 80)') || // Green
                style.backgroundColor.includes('rgb(255, 152, 0)') || // Orange  
                style.backgroundColor.includes('rgb(33, 150, 243)') || // Blue
                style.backgroundColor.includes('rgb(255, 87, 34)') || // Red
                style.backgroundColor.includes('rgb(158, 158, 158)')   // Gray
            );
            
            if (isFloating && isSmall && hasIndicatorColors && 
                !div.closest('.voice-toggle-container') && 
                !div.id.includes('voiceToggle')) {
                div.remove();
                console.log('Voice nav: Removed floating indicator-like element');
            }
        });
    }
    
    updateIndicator() {
        // Indicator functionality completely removed
        console.log('Voice nav: updateIndicator called but disabled');
    }

    updateIndicatorForSessionStart() {
        // EMERGENCY SHUTDOWN: All indicator functionality blocked
        console.log('Voice nav: updateIndicatorForSessionStart() - COMPLETELY DISABLED');
        this.removeAllIndicators();
        return; // Exit immediately - all code below is unreachable and will be cleaned up
        /* UNREACHABLE CODE BELOW - EMERGENCY SHUTDOWN ACTIVE */
        /* ALL INDICATOR FUNCTIONALITY BLOCKED */
    }
        // The following code is unreachable and should be removed to fix syntax errors.
        // If indicator functionality is needed, implement it inside a method or remove this block entirely.
    enable() {
        this.isEnabled = true;
        this.startListening();
        
        // Remove any existing indicator when enabling
        const existingIndicator = document.getElementById('voiceNavIndicator');
        if (existingIndicator) {
            existingIndicator.remove();
            console.log('Voice nav: Removed existing indicator on enable');
        }
    }
    
    disable() {
        this.isEnabled = false;
        this.stopListening();
        
        // Remove any existing indicator when disabling
        const existingIndicator = document.getElementById('voiceNavIndicator');
        if (existingIndicator) {
            existingIndicator.remove();
            console.log('Voice nav: Removed existing indicator on disable');
        }
    }
    
    showCommandFeedback(command) {
        // COMPLETELY DISABLED: Visual feedback disabled to prevent any indicators
        console.log('Voice nav: Command feedback BLOCKED -', command);
        return; // Exit immediately - no visual feedback allowed
    }
    
    monitorSpeechState() {
        let lastAskAIButtonText = '';
        
        // Monitor speech state changes and stop/start recognition accordingly
        setInterval(() => {
            const currentSpeechState = window.isSpeechInProgress === true;
            
            // Check Ask AI button state
            const askAIBtn = document.getElementById('askAI');
            const currentButtonText = askAIBtn ? askAIBtn.textContent : '';
            
            // IMMEDIATE STOP SPEAKING DETECTION - highest priority
            if (lastAskAIButtonText.includes('Stop Speaking') && 
                !currentButtonText.includes('Stop Speaking')) {
                console.log('Voice nav: IMMEDIATE Stop Speaking detected - DESTROYING recognition instance');
                
                // Set flag to reject any results for the next few seconds
                this.recentlyStoppedSpeaking = true;
                this.shouldIgnoreResults = true;
                
                // NUCLEAR OPTION: Completely destroy and recreate recognition to clear ALL buffers
                this.destroyRecognition();
                
                // Clear flags after extended delay
                setTimeout(() => {
                    console.log('Voice nav: Clearing recently stopped flag');
                    this.recentlyStoppedSpeaking = false;
                }, 5000);
                
                setTimeout(() => {
                    console.log('Voice nav: Clearing ignore flag and recreating recognition');
                    this.shouldIgnoreResults = false;
                    
                    // Recreate recognition instance from scratch
                    if (!this.recognition && this.isEnabled && !window.isSpeechInProgress && !this.isAskAIActive()) {
                        this.setupVoiceRecognition(); // Recreate fresh instance
                        
                        setTimeout(() => {
                            if (!window.isSpeechInProgress && !this.isAskAIActive() && !this.isListening) {
                                try {
                                    this.recognition.start();
                                    this.isListening = true;
                                    console.log('Voice nav: Fresh recognition instance started');
                                } catch (e) {
                                    console.log('Voice nav: Failed to start fresh instance');
                                }
                            }
                        }, 500);
                    }
                }, 4000); // 4 seconds to ensure all buffers are completely cleared
                
                lastAskAIButtonText = currentButtonText;
                // Indicator functionality completely removed
                return; // Skip all other logic when Stop Speaking detected
            }
            
            // PRIORITY 1: Avatar initialization has absolute precedence - stay completely disabled
            if (this.isAvatarInitializing) {
                // Avatar is initializing - stay completely disabled and ignore everything
                if (this.recognition) {
                    this.destroyRecognition();
                    console.log('Voice nav: Staying disabled during avatar initialization');
                }
                // Indicator functionality completely removed
                lastAskAIButtonText = currentButtonText;
                return; // Skip ALL other logic during avatar initialization
            }
            
            // PRIORITY 2: Ask AI has precedence - always stop voice nav when Ask AI is active
            const askAIActive = currentButtonText.includes('Listening') || 
                               currentButtonText.includes('Processing') || 
                               currentButtonText.includes('Stop Speaking') ||
                               currentButtonText.includes('Stop Listening');
            
            if (askAIActive) {
                // Ask AI is active - MUST stop voice navigation completely
                if (this.isListening && this.recognition) {
                    this.destroyRecognition();
                    console.log('Voice nav: STOPPED for Ask AI');
                }
                // Indicator functionality completely removed
                lastAskAIButtonText = currentButtonText;
                return; // Skip all other logic when Ask AI is active
            }
            
            lastAskAIButtonText = currentButtonText;
            
            // PRIORITY 2: Avatar speaking - COMPLETELY DESTROY recognition to prevent microphone feedback
            // BUT ONLY if not protected from destruction (e.g., during start session)
            if (currentSpeechState && !this.isProtectedFromDestruction) {
                // Avatar is speaking - DESTROY recognition to stop microphone completely
                this.shouldIgnoreResults = true;
                if (this.recognition) {
                    console.log('Voice nav: DESTROYING recognition (avatar speaking - preventing microphone feedback)');
                    this.destroyRecognition();
                }
            } else if (currentSpeechState && this.isProtectedFromDestruction) {
                // Avatar is speaking but we're protected - just set ignore flag without destroying
                this.shouldIgnoreResults = true;
                if (this.recognition && this.isListening) {
                    this.recognition.stop();
                    this.isListening = false;
                    console.log('Voice nav: STOPPED recognition (protected from destruction during session initialization)');
                }
            } else {
                // Avatar not speaking - Can recreate and start if enabled AND Ask AI not active
                if (!this.recognition && this.isEnabled && !this.shouldIgnoreResults && !this.isAskAIActive()) {
                    // Only recreate if we're really clear
                    const isReallyQuiet = !window.isSpeechInProgress && 
                                         !currentButtonText.includes('Stop Speaking') &&
                                         !currentButtonText.includes('Processing') &&
                                         !currentButtonText.includes('Listening');
                    
                    if (isReallyQuiet) {
                        console.log('Voice nav: Recreating recognition (avatar finished speaking)');
                        this.setupVoiceRecognition();
                        
                        setTimeout(() => {
                            if (this.recognition && !window.isSpeechInProgress && !this.isAskAIActive()) {
                                try {
                                    this.recognition.start();
                                    this.isListening = true;
                                    console.log('Voice nav: Started fresh recognition (avatar finished)');
                                } catch (e) {
                                    console.log('Voice nav: Failed to start fresh recognition');
                                }
                            }
                        }, 200); // Small delay for stability
                    }
                }
                
                // Clear ignore flag when avatar definitely stops speaking (but not after Stop Speaking)
                if (this.shouldIgnoreResults && !currentSpeechState && !this.isAskAIActive() && !this.recentlyStoppedSpeaking) {
                    setTimeout(() => {
                        if (!window.isSpeechInProgress && !this.isAskAIActive() && !this.recentlyStoppedSpeaking) {
                            this.shouldIgnoreResults = false;
                            console.log('Voice nav: Cleared ignore flag (normal)');
                        }
                    }, 500); // Shorter delay for normal speech end
                }
            }
            
            // Update state tracking
            this.lastSpeechState = currentSpeechState;
            // Indicator functionality completely removed
            
        }, 25); // Check even more frequently (every 25ms) for immediate Stop Speaking detection
    }
    
    destroyRecognition() {
        // Clear speech timeout
        if (this.speechTimeoutId) {
            clearTimeout(this.speechTimeoutId);
            this.speechTimeoutId = null;
        }
        
        if (this.recognition) {
            this.recognition.stop();
            this.recognition.onresult = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition.onstart = null;
            this.recognition = null;
            this.isListening = false;
            console.log('Voice nav: Recognition instance DESTROYED (microphone fully disabled)');
        }
    }
    
    isAskAIActive() {
        const askAIBtn = document.getElementById('askAI');
        if (!askAIBtn) return false;
        
        const btnText = askAIBtn.textContent;
        return btnText.includes('Listening') || 
               btnText.includes('Processing') || 
               btnText.includes('Stop Speaking') ||
               btnText.includes('Stop Listening');
    }
    
    // Voice toggle methods - COMPLETELY INDEPENDENT OF INDICATORS
    toggleVoice() {
        this.voiceEnabled = !this.voiceEnabled;
        
        // NUCLEAR CLEANUP: Remove any indicators IMMEDIATELY when toggle is used
        this.removeAllIndicators();
        
        // Update ONLY the toggle UI - NO INDICATORS
        this.updateVoiceToggleUI();
        
        // DOUBLE CLEANUP: Remove indicators again
        setTimeout(() => {
            this.removeAllIndicators();
        }, 10);
        
        if (this.voiceEnabled) {
            // Re-enable voice recognition
            if (!this.isListening && this.recognition) {
                this.startListening();
            }
            console.log('Voice nav: Voice recognition ENABLED');
        } else {
            // Stop voice recognition but keep instance for re-enabling
            if (this.isListening && this.recognition) {
                this.recognition.stop();
            }
            console.log('Voice nav: Voice recognition DISABLED');
        }
        
        // AGGRESSIVE: Remove any indicators that might have been created
        this.removeAllIndicators();
    }
    
    updateVoiceToggleUI() {
        // Update ONLY the checkbox state - nothing else
        const toggleCheckbox = document.getElementById('voiceToggleCheckbox');
        if (toggleCheckbox) {
            toggleCheckbox.checked = this.voiceEnabled;
        }
        
        // DO NOT update any indicators - force remove them
        this.removeAllIndicators();
    }
    
    // Indicator police - continuously removes any indicators that might appear
    startIndicatorPolice() {
        // Immediate cleanup
        this.removeAllIndicators();
        
        // Set up mutation observer to catch indicators being added to DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        // Check if the added element is an indicator
                        if (node.id && node.id.includes('voiceNav')) {
                            node.remove();
                            console.log('Voice nav: BLOCKED indicator creation:', node.id);
                        }
                        
                        // Check for elements with indicator-like content
                        if (node.innerHTML && (node.innerHTML.includes('🎤') || node.innerHTML.includes('Voice Navigation'))) {
                            node.remove();
                            console.log('Voice nav: BLOCKED suspicious element:', node.innerHTML.substring(0, 50));
                        }
                        
                        // Check all child elements too
                        const suspiciousChildren = node.querySelectorAll && node.querySelectorAll('[id*="voiceNav"], [class*="voice-indicator"]');
                        if (suspiciousChildren && suspiciousChildren.length > 0) {
                            suspiciousChildren.forEach(child => {
                                child.remove();
                                console.log('Voice nav: BLOCKED child indicator');
                            });
                        }
                    }
                });
            });
        });
        
        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Also run periodic cleanup
        setInterval(() => {
            this.removeAllIndicators();
        }, 500); // Check every 500ms
        
        // NUCLEAR CLEANUP: Run every 2 seconds to destroy any persistent indicators
        setInterval(() => {
            console.log('Voice nav: Nuclear cleanup sweep...');
            
            // Remove anything that looks remotely like an indicator
            const suspiciousElements = document.querySelectorAll('*');
            suspiciousElements.forEach(el => {
                if (el.textContent && (
                    el.textContent.includes('Voice Navigation') ||
                    el.textContent.includes('Microphone') ||
                    el.textContent.includes('🎤') ||
                    el.textContent.includes('Speak now')
                )) {
                    // Preserve the voice toggle
                    if (!el.closest('.voice-toggle-container') && 
                        !el.id.includes('voiceToggle') && 
                        !el.className.includes('voice-toggle')) {
                        el.remove();
                        console.log('Voice nav: Nuclear removal of:', el.tagName, el.id, el.className);
                    }
                }
            });
        }, 2000);
        
        console.log('Voice nav: Indicator police started - DOM monitoring active');
    }

    // NUCLEAR CLEANUP METHOD - Aggressively removes ANY visual elements every 100ms
    startNuclearCleanup() {
        console.log('Voice nav: Starting NUCLEAR indicator cleanup (every 100ms)');
        
        setInterval(() => {
            // PRIORITY TARGET: The specific voiceNavIndicator you mentioned
            const priorityTarget = document.getElementById('voiceNavIndicator');
            if (priorityTarget) {
                priorityTarget.remove();
                console.log('Voice nav: ⚡ DESTROYED voiceNavIndicator element');
            }
            
            // Target EVERYTHING that could possibly be an indicator
            const suspiciousElements = document.querySelectorAll(`
                #voiceNavIndicator,
                div[id*="voiceNav"],
                div[style*="position: fixed"],
                div[style*="position: absolute"],
                div[style*="background"],
                span[style*="background"],
                div[title*="Voice"],
                div[title*="voice"],
                div[title*="Mic"],
                div[title*="mic"],
                [id*="voiceNav"],
                [class*="voice-indicator"],
                [class*="voiceIndicator"]
            `);
            
            let removed = 0;
            suspiciousElements.forEach(el => {
                // Skip the voice toggle itself
                if (el.closest('.voice-toggle-container') || 
                    el.id === 'voiceToggleCheckbox' || 
                    el.classList.contains('voice-toggle-slider') ||
                    el.classList.contains('voice-toggle-switch')) {
                    return;
                }
                
                // Remove if it contains voice-related content or looks like feedback
                if (el.innerHTML && (
                    el.innerHTML.includes('🎤') ||
                    el.innerHTML.includes('Voice:') ||
                    el.innerHTML.includes('Heard:') ||
                    el.innerHTML.includes('Executed:') ||
                    el.innerHTML.includes('Voice Navigation') ||
                    el.innerHTML.includes('Microphone')
                )) {
                    el.remove();
                    removed++;
                }
                
                // Remove if it has suspicious styling (green boxes, positioned elements with text)
                const style = window.getComputedStyle(el);
                if ((style.position === 'fixed' || style.position === 'absolute') &&
                    el.textContent && 
                    (el.textContent.includes('Voice') || el.textContent.includes('🎤'))) {
                    el.remove();
                    removed++;
                }
            });
            
            if (removed > 0) {
                console.log(`Voice nav: NUCLEAR cleanup removed ${removed} suspicious elements`);
            }
        }, 100); // Run every 100ms - very aggressive
    }
}
// Initialize voice navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait a moment for other scripts to initialize
    setTimeout(() => {
        // Aggressively clean up any existing indicators from previous sessions
        console.log('Voice nav: Starting aggressive indicator cleanup...');
        
        // Remove by ID
        const existingIndicator = document.getElementById('voiceNavIndicator');
        if (existingIndicator) {
            existingIndicator.remove();
            console.log('Voice nav: Cleaned up existing indicator from previous session');
        }
        
        // Remove any elements that might be indicators
        const selectors = [
            '[id*="voiceNav"]', 
            '[class*="voice-indicator"]', 
            '[class*="voiceIndicator"]',
            'div[style*="voice"]',
            'div[title*="Voice Navigation"]'
        ];
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.remove();
                console.log('Voice nav: Removed indicator element:', selector);
            });
        });
        
        window.voiceSlideNav = new VoiceSlideNavigator();
        
        // Update voice toggle UI when state changes  
        setInterval(() => {
            if (window.voiceSlideNav) {
                // AGGRESSIVELY remove indicators every 500ms
                window.voiceSlideNav.removeAllIndicators();
                
                // Update ONLY the voice toggle UI - NO INDICATORS
                window.voiceSlideNav.updateVoiceToggleUI();
                
                // Aggressively restart recognition if it should be running but isn't
                const shouldBeActive = window.voiceSlideNav.shouldProcessCommands();
                if (shouldBeActive && !window.voiceSlideNav.isListening && window.voiceSlideNav.recognition && window.voiceSlideNav.voiceEnabled) {
                    try {
                        window.voiceSlideNav.recognition.start();
                        window.voiceSlideNav.isListening = true;
                    } catch (e) {
                        // Ignore if already running
                    }
                }
            }
        }, 500); // Check more frequently
    }, 2000);
});

// Global function for voice toggle button
window.toggleVoiceInput = function() {
    if (window.voiceSlideNav) {
        window.voiceSlideNav.toggleVoice();
    }
};

// Global function to manually force indicator cleanup
window.forceRemoveAllIndicators = function() {
    console.log('Manual indicator cleanup triggered...');
    
    // Aggressive cleanup
    const selectors = [
        '#voiceNavIndicator',
        '[id*="voiceNav"]',
        '[class*="voice-indicator"]', 
        '[class*="voiceIndicator"]',
        'div[style*="voice"]',
        '[title*="Voice Navigation"]',
        'div[style*="position: fixed"]',
        'div[style*="position: absolute"]'
    ];
    
    let removedCount = 0;
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (element.innerHTML && 
                (element.innerHTML.includes('🎤') || 
                 element.innerHTML.includes('Voice Navigation') ||
                 element.innerHTML.includes('Microphone') ||
                 (element.title && element.title.includes('Voice')))) {
                // Don't remove the voice toggle
                if (!element.closest('.voice-toggle-container') && !element.id.includes('voiceToggle')) {
                    element.remove();
                    removedCount++;
                }
            }
        });
    });
    
    console.log(`Manual cleanup removed ${removedCount} indicator elements`);
    
    if (window.voiceSlideNav) {
        window.voiceSlideNav.removeAllIndicators();
    }
};

// SPECIAL HUNTER: Function to specifically hunt and destroy voiceNavIndicator
window.destroyVoiceNavIndicator = function() {
    console.log('🎯 HUNTING voiceNavIndicator...');
    
    // Method 1: Direct ID targeting
    const target1 = document.getElementById('voiceNavIndicator');
    if (target1) {
        target1.remove();
        console.log('✅ DESTROYED voiceNavIndicator via getElementById');
        return true;
    }
    
    // Method 2: QuerySelector variants
    const selectors = [
        '#voiceNavIndicator',
        '[id="voiceNavIndicator"]',
        'div[id="voiceNavIndicator"]',
        '*[id="voiceNavIndicator"]'
    ];
    
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            elements.forEach(el => el.remove());
            console.log(`✅ DESTROYED ${elements.length} elements via selector: ${selector}`);
            return true;
        }
    }
    
    // Method 3: Brute force search all elements
    const allElements = document.querySelectorAll('*');
    let found = false;
    allElements.forEach(el => {
        if (el.id === 'voiceNavIndicator' || el.getAttribute('id') === 'voiceNavIndicator') {
            el.remove();
            console.log('✅ DESTROYED voiceNavIndicator via brute force search');
            found = true;
        }
    });
    
    if (!found) {
        console.log('❌ voiceNavIndicator not found in DOM');
        return false;
    }
    
    return found;
};