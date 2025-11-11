
(function(){
    window.addEventListener('DOMContentLoaded', () => {
        // Query buttons after DOM is loaded
        let prevBtn = document.getElementById('prevSlideBtn');
        let nextBtn = document.getElementById('nextSlideBtn');
        let stopSpeakingBtn = document.getElementById('stopSpeaking');
        let replayBtn = document.getElementById('replaySpeaking');
        window.currentSlideIdx = 0;
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (window.narrationsData && window.currentSlideIdx > 0) {
                    window.currentSlideIdx--;
                    if (typeof showCurrentSlideNarration === 'function') showCurrentSlideNarration(true); // Enable auto-speak for user navigation
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (window.narrationsData && window.currentSlideIdx < window.narrationsData.length - 1) {
                    window.currentSlideIdx++;
                    if (typeof showCurrentSlideNarration === 'function') showCurrentSlideNarration(true); // Enable auto-speak for user navigation
                }
            });
        }
        // Initially disable all control buttons
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (stopSpeakingBtn) stopSpeakingBtn.disabled = true;
        if (replayBtn) replayBtn.disabled = true;

        let narrationUrl = localStorage.getItem('narration_json_url');
        if (narrationUrl && narrationUrl !== 'null' && narrationUrl !== 'undefined') {
            fetch(narrationUrl)
                .then(response => response.json())
                .then(json => {
                    window.narrationsData = Array.isArray(json) ? json : (json.narrations || []);
                    
                    // FORCE reset to slide 1 (index 0) - this ensures we always start from the beginning
                    window.currentSlideIdx = 0;
                    
                    // Enable navigation buttons if more than one slide (regardless of session state)
                    if (window.narrationsData.length > 1) {
                        if (prevBtn) prevBtn.disabled = false; // Enable for slide navigation
                        if (nextBtn) nextBtn.disabled = false; // Enable for slide navigation
                    } else {
                        if (prevBtn) prevBtn.disabled = true;
                        if (nextBtn) nextBtn.disabled = true;
                    }
                    
                    // Also call enableControlButtons to handle other buttons properly
                    if (typeof enableControlButtons === 'function') enableControlButtons();
                    if (typeof showCurrentSlideNarration === 'function') showCurrentSlideNarration();
                    
                    // ADDITIONAL FAILSAFE: Force to first slide after a short delay
                    setTimeout(() => {
                        if (window.narrationsData && window.narrationsData.length > 0) {
                            window.currentSlideIdx = 0;
                            if (typeof showCurrentSlideNarration === 'function') {
                                showCurrentSlideNarration();
                            }
                        }
                    }, 100);
                })
                .catch(err => {
                    console.warn('Failed to load narration data:', err);
                    // Initialize with empty data if loading fails
                    window.narrationsData = [];
                    window.currentSlideIdx = 0;
                    if (typeof log === 'function') log('Failed to load narration.json: ' + err);
                });
        } else {
            if (typeof log === 'function') log('No narration_json_url found in localStorage.');
        }
        
        // Add keyboard navigation (left/right arrow keys)
        document.addEventListener('keydown', function(event) {
            if (event.key === 'ArrowLeft') {
                // Previous slide (same logic as button click)
                if (window.narrationsData && window.currentSlideIdx > 0) {
                    event.preventDefault();
                    window.currentSlideIdx--;
                    if (typeof showCurrentSlideNarration === 'function') showCurrentSlideNarration(true); // Enable auto-speak for user navigation
                }
            } else if (event.key === 'ArrowRight') {
                // Next slide (same logic as button click)
                if (window.narrationsData && window.currentSlideIdx < window.narrationsData.length - 1) {
                    event.preventDefault();
                    window.currentSlideIdx++;
                    if (typeof showCurrentSlideNarration === 'function') showCurrentSlideNarration(true); // Enable auto-speak for user navigation
                }
            }
        });
    });
})();
