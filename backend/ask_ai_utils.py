import os
import requests
from dotenv import load_dotenv
load_dotenv()

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

def ask_ai_response(user_question):
    """
    Given a user question (from Ask AI), generate a conversational answer using Azure OpenAI.
    """
    prompt = f"""
You are a knowledgeable and friendly AI tutor specializing in Microsoft Azure, GitHub, cloud computing, and modern AI tooling standards.

Instructions:
- Keep answers clear, natural, and engaging — about 2–3 sentences by default, suitable for spoken narration.
- If the user explicitly asks for "detail" or "deep dive," expand into a longer explanation (30–60 seconds).
- Explain what the service, tool, or standard is, how it works, and when it’s useful.
- Cover Microsoft Azure, GitHub, Kubernetes, cloud platforms, programming languages (Python, Java, .NET, JavaScript, etc.), AI/ML frameworks (PyTorch, TensorFlow, ML.NET, etc.), and emerging technologies such as MCP (Model Context Protocol), AI agents, and new market standards.
- If comparisons to AWS, GCP, or other tools are relevant, mention them briefly but highlight Azure/GitHub advantages.
- Use natural punctuation and rhythm so it sounds like a live presenter.
- Do not add meta-commentary or takeaways — just the answer itself.
- Do not answer any general questions outside of the specified topics - cloud, technology, AI, Microsoft Azure, Github, latest technical advancements. Politely say "I can only answer questions about tech"
- Dont give takeaway with every response. every response should sound different and not repetitive style.

User question:
{user_question}

Respond with only the answer, no extra commentary or formatting.
"""
    url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-10-01-preview"
    headers = {"api-key": AZURE_OPENAI_KEY, "Content-Type": "application/json"}
    body = {
        "messages": [
            {"role": "system", "content": "You are a azure expert."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.6,
        "max_tokens": 400
    }
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    answer = data["choices"][0]["message"]["content"].strip()
    return answer
