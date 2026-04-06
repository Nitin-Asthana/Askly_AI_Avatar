# Askly — AI Avatar Presenter

> Transform static PowerPoint presentations into interactive, voice-narrated experiences powered by Azure AI.

## What is Askly?

Askly converts your existing PowerPoint slides into a live, interactive session delivered by a lifelike AI avatar. The avatar narrates each slide in natural speech, answers audience questions in real time, and responds to voice navigation commands — all without any live presenter.

**Key capabilities:**
- 🎙️ **AI Avatar Narration** — Lifelike talking avatar narrates slide content via Azure AI Speech
- 💬 **Interactive Q&A** — Users ask questions by voice; avatar responds using Azure OpenAI
- 🖐️ **Voice Navigation** — Hands-free control ("next slide", "go back", "replay")
- ⚡ **Rapid Setup** — Upload a `.pptx`, process it, and start a session in minutes

---

## Architecture

```
PowerPoint Upload
      │
      ▼
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Flask Backend  │────▶│  Azure OpenAI    │     │  Azure AI Speech │
│  (Python)       │     │  (GPT-4o)        │     │  (Avatar/TTS)    │
└────────┬────────┘     │  Narration + Q&A │     │  WebRTC Stream   │
         │              └──────────────────┘     └──────────────────┘
         ▼
┌─────────────────┐
│  Azure Blob     │
│  Storage        │
│  uploads/       │
│  slides/        │
│  outputs/       │
└─────────────────┘
```

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.9+ |
| LibreOffice | 7.x+ |
| Poppler Utils | 21.x+ |
| Browser | Chrome or Edge (latest) |

**Azure services required:** Azure Storage Account · Azure OpenAI (GPT-4o) · Azure AI Speech · Azure Entra ID

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/<your-org>/Avatar_Live_Code_SP.git
cd Avatar_Live_Code_SP

# 2. Install Python dependencies
cd backend
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your Azure OpenAI credentials

# 4. Update blob_utils.py with your Azure Storage credentials

# 5. Start the backend
python app.py

# 6. Open the frontend
# Navigate to frontend/ppt_upload.html in Chrome or Edge
```

---

## Configuration

Create a `.env` file in the `backend/` directory:

```env
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
AZURE_OPENAI_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
```

Update `backend/blob_utils.py` with your storage credentials (or use Managed Identity for production).

⚠️ **Never commit credentials to source control.** Use Azure Key Vault or App Service Configuration for production deployments.

---

## Project Structure

```
├── backend/
│   ├── app.py                  # Flask application entry point
│   ├── blob_utils.py           # Azure Blob Storage client
│   ├── openai_utils.py         # Narration generation (Azure OpenAI)
│   ├── ask_ai_utils.py         # Q&A handler (Azure OpenAI)
│   ├── processor.py            # PPT → PDF → PNG pipeline
│   └── requirements.txt
├── frontend/
│   ├── basic.html              # Main avatar presenter page
│   ├── ppt_upload.html         # Upload and processing page
│   └── js/
│       ├── basic.js            # Avatar session management
│       ├── ppt_upload.js       # Upload logic
│       ├── ask_ai_voice.js     # Voice Q&A handler
│       └── narration_loader.js # Slide narration loader
└── README.md
```

---

## Documentation

| Document | Description |
|---|---|
| Askly Business Use Cases | Industry scenarios and concept applicability |
| Askly Setup & Deployment Guide | Full installation and Azure deployment steps |

---

## Deployment

For full Azure cloud deployment (App Service + Static Web Apps)

**Supported avatar regions:** `eastus2` · `westus2` · `westeurope` · `southeastasia`

---

## Built With

- [Azure AI Speech](https://azure.microsoft.com/en-us/products/ai-services/ai-speech) — Talking avatar and text-to-speech
- [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) — GPT-4o for narration and Q&A
- [Azure Blob Storage](https://azure.microsoft.com/en-us/products/storage/blobs) — Content management
- [Flask](https://flask.palletsprojects.com/) — Backend API
- [python-pptx](https://python-pptx.readthedocs.io/) — PowerPoint parsing

## License

MIT
