#!/usr/bin/env python3
import re

# Read the current file
with open('voice_slide_navigation.js', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Find the problematic method and fix it
# Look for the pattern where the malformed code starts
pattern = r'(\/\* ALL INDICATOR FUNCTIONALITY BLOCKED \*\/\s*}\s*)(\s*indicator\.innerHTML.*?)(\s*enable\(\) {)'

# Replace with clean version
replacement = r'\1\n\n    // === ALL MALFORMED INDICATOR CODE REMOVED ===\n    // Indicator creation completely disabled to prevent visual pollution\n\n    \3'

# Apply the fix
fixed_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Write the fixed file
with open('voice_slide_navigation.js', 'w', encoding='utf-8') as f:
    f.write(fixed_content)

print("Fixed malformed indicator code!")