#!/usr/bin/env python3

# Read the current file
with open('voice_slide_navigation.js', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Find where the malformed code starts (after the method closing brace)
method_end_found = False
malformed_start = -1
enable_method_start = -1

for i, line in enumerate(lines):
    if '/* ALL INDICATOR FUNCTIONALITY BLOCKED */' in line and '}' in lines[i+1] if i+1 < len(lines) else False:
        method_end_found = True
        malformed_start = i + 2  # Two lines after the comment
        print(f"Method end found at line {i+2}")
    elif 'enable() {' in line and method_end_found and malformed_start != -1:
        enable_method_start = i
        print(f"Enable method found at line {i+1}")
        break

if malformed_start != -1 and enable_method_start != -1:
    print(f"Removing malformed code from line {malformed_start+1} to {enable_method_start}")
    
    # Create new content: everything before malformed + clean separator + everything from enable method onward
    new_lines = (
        lines[:malformed_start] + 
        ['\n', '    // === ALL MALFORMED INDICATOR CODE REMOVED ===\n', 
         '    // Indicator creation completely disabled to prevent visual pollution\n', '\n'] +
        lines[enable_method_start:]
    )
    
    # Write the fixed file
    with open('voice_slide_navigation.js', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f"SUCCESS: Removed {enable_method_start - malformed_start} lines of malformed indicator code!")
else:
    print("Could not find the malformed code section to remove")