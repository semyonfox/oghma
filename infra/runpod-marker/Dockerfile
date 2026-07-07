FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

ENV PYTHONUNBUFFERED=1 \
  HF_HOME=/opt/marker-cache/huggingface \
  TORCH_HOME=/opt/marker-cache/torch \
  XDG_CACHE_HOME=/opt/marker-cache \
  TORCH_DEVICE=cuda

WORKDIR /app

COPY infra/runpod-marker/requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && \
  python -m pip install --no-cache-dir -r /app/requirements.txt

COPY infra/runpod-marker/prefetch_models.py /app/prefetch_models.py
RUN TORCH_DEVICE=cpu python /app/prefetch_models.py && \
  chmod -R a+rX,u+w /opt/marker-cache

COPY infra/runpod-marker/server.py /app/server.py
COPY infra/runpod-marker/run.sh /app/run.sh
COPY infra/runpod-marker/aggressive-bench.sh /app/aggressive-bench.sh
RUN chmod +x /app/run.sh /app/aggressive-bench.sh

EXPOSE 8000 8888 22
CMD ["/app/run.sh"]
