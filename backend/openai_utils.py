
import os
import openai



import requests

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

def generate_script_from_notes(notes_list):
    return generate_all_scripts(notes_list)

def generate_slide_script(title, notes, style="conversational"):
    prompt = f"""
You are an expert keynote presenter and instructor.  
Transform the PowerPoint slide notes into a spoken narration that feels natural, engaging, and audience-friendly.  

Improved narration style:
- Write for the EAR, not the eye — make it sound like live speech, not a document.  
- Vary sentence length and rhythm: mix short impactful lines with longer, flowing ones.  
- Use pauses (commas, em dashes —, ellipses …) to create breathing space. give bigger pauses so it should feel as if real person is speaking. 
- Add rhetorical devices like light questions, gentle emphasis, or relatable examples to break monotony.  
- Each slide narration should feel slightly different in style — no formulaic intros or repeated patterns.  
- Mention the slide title only if it helps with context or flow, not as a rule and not "let's talk about everytime.."
- Keep it clear and concise: ~15 sec to 2 min depending on slide depth.  
- Don't start every narration with "Imagine a world" or "Imagine.." - this is very monotone on each slide.
- Highlight key ideas naturally with words like “the real takeaway,” “what this means is,” or “in practice.” but change everytime. It shouldn't feel monotone. 
- Avoid clichés like “Imagine a world…” or repetitive opening lines. Each narration should start fresh, in its own unique voice.  
- Use conversational tone, as if speaking directly to the audience with warmth and energy. 
- Output only the narration text, without extra commentary or formatting. 

Slide title: {title}
Slide notes:
{notes}

Respond with the narration only.
"""
    url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-10-01-preview"
    headers = {"api-key": AZURE_OPENAI_KEY, "Content-Type": "application/json"}
    body = {
        "messages": [
            {"role": "system", "content": "You write engaging presentation scripts."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.6,
        "max_tokens": 400
    }
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    narration = data["choices"][0]["message"]["content"].strip()
    return narration

def generate_all_scripts(slide_infos):
    narrations = []
    for slide in slide_infos:
        title = slide.get("title", "")
        notes = slide.get("notes", "")
        try:
            narration = generate_slide_script(title, notes)
        except Exception as e:
            print(f"Narration generation failed for slide '{title}': {e}")
            narration = ""
        narrations.append(narration)
    return narrations
