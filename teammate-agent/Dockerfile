# Ana in LiveKit Cloud (put-ana-online.bat). Her keys come from the cloud's secrets, never a .env file;
# LiveKit Cloud supplies LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET itself.
FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN adduser --disabled-password --gecos "" --uid 10001 ana
WORKDIR /home/ana/app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY --chown=ana:ana . .
USER ana
CMD ["python", "agent.py", "start"]
