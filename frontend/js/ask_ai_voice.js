// Helper to HTML-encode text for SSML safety
function htmlEncode(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
                      .replace(/'/g, "&#39;");
}

// Helper to speak text with avatar using existing SSML logic
function speakWithAvatarSSML(answerText) {
    // Always unmute audio element before speaking
    var audioElem = document.getElementById('audio');
    if (audioElem) audioElem.muted = false;
    const ttsVoice = document.getElementById('ttsVoice').value || 'en-US-AvaMultilingualNeural';
    const personalVoiceSpeakerProfileID = document.getElementById('personalVoiceSpeakerProfileID').value || '';
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${ttsVoice}'><mstts:ttsembedding speakerProfileId='${personalVoiceSpeakerProfileID}'><mstts:leadingsilence-exact value='0'/>${htmlEncode(answerText)}</mstts:ttsembedding></voice></speak>`;
    
    // Set speech state for voice navigation system
    window.isSpeechInProgress = true;
    
    // Use the new button management system
    if (typeof disableControlButtons === 'function') {
        disableControlButtons();
    }
    
    if (window.avatarSynthesizer && typeof window.avatarSynthesizer.speakSsmlAsync === 'function') {
        window.avatarSynthesizer.speakSsmlAsync(ssml).then(
            function(result) {
                // Clear speech state for voice navigation system
                window.isSpeechInProgress = false;
                
                // Use the new button management system
                if (typeof enableControlButtons === 'function') {
                    enableControlButtons();
                }
            },
            function(err) {
                // Clear speech state for voice navigation system even on error
                window.isSpeechInProgress = false;
                
                // Use the new button management system for errors too
                if (typeof enableControlButtons === 'function') {
                    enableControlButtons();
                }
            }
        );
    }
}
// Enable/disable Ask AI button in sync with Speak button and session state
function syncAskAIButton() {
    var askAIButton = document.getElementById('askAI');
    var startSessionBtn = document.getElementById('startSession');
    var stopSessionBtn = document.getElementById('stopSession');
    if (!askAIButton || !startSessionBtn || !stopSessionBtn) return;
    // Enable Ask AI if session is active (stopSession enabled) and not currently speaking
    var stopSpeakingBtn = document.getElementById('stopSpeaking');
    askAIButton.disabled = stopSessionBtn.disabled || (stopSpeakingBtn && !stopSpeakingBtn.disabled);
}

window.addEventListener('DOMContentLoaded', function() {
    syncAskAIButton();
    // Also observe changes to Speak/StopSpeaking buttons
    var speakBtn = document.getElementById('speak');
    var stopSpeakingBtn = document.getElementById('stopSpeaking');
    if (speakBtn) speakBtn.addEventListener('disabled', syncAskAIButton);
    if (stopSpeakingBtn) stopSpeakingBtn.addEventListener('disabled', syncAskAIButton);
    // Fallback: poll for state changes (since .disabled is not an event)
    setInterval(syncAskAIButton, 300);
});
// ask_ai_voice.js
// Handler for Ask AI button: accepts voice input and sends recognized text to a callback (integration separate)

window.askAI = function() {
    // Disable button to prevent double clicks and show listening state immediately
    const askAIButton = document.getElementById('askAI');
    askAIButton.disabled = true;
    askAIButton.textContent = 'Listening...';
    
    // Use Web Speech API for browser-based speech recognition (direct start)
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('Speech recognition not supported in this browser.');
        askAIButton.disabled = false;
        askAIButton.textContent = 'Ask AI';
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
        
        // Enhanced configuration for better recognition
        recognition.lang = 'en-US';
        recognition.interimResults = false; // Back to false for simpler handling
        recognition.maxAlternatives = 1;
        recognition.continuous = false;
        
        // Add timeout handling
        let speechTimeout;
        let hasStarted = false;
        
        recognition.onstart = function() {
            console.log('Speech recognition started');
            hasStarted = true;
            askAIButton.textContent = 'Listening...';
            
            // Set a longer timeout and only use it if no results come
            speechTimeout = setTimeout(() => {
                console.log('Speech timeout - no speech detected');
                recognition.abort(); // Use abort instead of stop to prevent duplicate events
            }, 20000); // Increased to 20 seconds
        };
        
        recognition.onresult = function(event) {
            console.log('Speech recognized successfully');
            clearTimeout(speechTimeout); // Clear timeout immediately when we get results
            
            const transcript = event.results[0][0].transcript;
            askAIButton.textContent = 'Ask AI';
            console.log('Question heard:', transcript);
            
            // Send transcript to backend for AI answer
            fetch('http://localhost:5050/api/ask_ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: transcript })
            })
            .then(response => response.json())
            .then(data => {
                console.log('Ask AI response:', data.answer);
                if (data.answer) {
                    speakWithAvatarSSML(data.answer);
                }
            })
            .catch(err => {
                console.error('Error contacting AI:', err);
                askAIButton.disabled = false;
            });
        };
        
        recognition.onerror = function(event) {
            console.error('Speech recognition error:', event.error);
            clearTimeout(speechTimeout);
            
            // Only reset button if it's not a timeout-caused error
            if (event.error !== 'aborted') {
                askAIButton.textContent = 'Ask AI';
                askAIButton.disabled = false;
            }
        };
        
        recognition.onend = function() {
            console.log('Speech recognition ended');
            clearTimeout(speechTimeout);
            askAIButton.textContent = 'Ask AI';
            askAIButton.disabled = false;
        };
        
        // Start recognition immediately
        recognition.start();
};
