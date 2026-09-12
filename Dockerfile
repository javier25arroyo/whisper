# ============================================================
# OpenAI Whisper — Docker image with CUDA support (CLI usage)
# ============================================================
# Base: NVIDIA CUDA 12.1 runtime + cuDNN 8 on Ubuntu 22.04
# This allows GPU-accelerated inference via PyTorch + CUDA.
# ============================================================

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# ── Build-time arguments ──────────────────────────────────────
ARG PYTHON_VERSION=3.11
ARG WHISPER_MODEL=turbo

# ── Environment ───────────────────────────────────────────────
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WHISPER_CACHE=/root/.cache/whisper \
    WHISPER_MODEL=${WHISPER_MODEL}

# ── System dependencies ───────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        python${PYTHON_VERSION} \
        python${PYTHON_VERSION}-dev \
        python3-pip \
        ffmpeg \
        curl \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Make python3.11 the default python/pip
RUN update-alternatives --install /usr/bin/python python /usr/bin/python${PYTHON_VERSION} 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1 \
    && python -m pip install --upgrade pip

# ── Working directory ─────────────────────────────────────────
WORKDIR /app

# ── Install Python dependencies first (cache layer) ───────────
COPY requirements.txt pyproject.toml ./

# Install PyTorch with CUDA 12.1 support, then the rest of deps
RUN pip install --no-cache-dir \
        torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/cu121 \
    && pip install --no-cache-dir -r requirements.txt

# ── Install the Whisper package from source ───────────────────
COPY . .
RUN pip install --no-cache-dir -e .

# ── Pre-download model weights at build time (optional) ───────
RUN python -c "import whisper; whisper.load_model('${WHISPER_MODEL}')"

# ── Runtime volume for audio input/output ─────────────────────
VOLUME ["/data"]

# ── Entrypoint ────────────────────────────────────────────────
ENTRYPOINT ["whisper"]
CMD ["--help"]
