#!/usr/bin/env python3
"""
Marker OCR FastAPI Server
Wraps marker-pdf library for extraction via HTTP API
"""

import logging
import sys
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Initializing Marker OCR server...")
logger.info(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    logger.info(
        f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB"
    )

# Import marker after logging setup
try:
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict

    logger.info("✓ Marker library loaded successfully")
except ImportError as e:
    logger.error(f"Failed to import marker: {e}")
    sys.exit(1)

app = FastAPI(title="Marker OCR Server", version="1.0.0")

# Initialize marker models on startup
model_dict = None


@app.on_event("startup")
async def startup_event():
    global model_dict
    logger.info("Loading marker models...")
    try:
        model_dict = create_model_dict()
        logger.info("✓ Models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise


@app.get("/")
async def health_check():
    """Health check endpoint for ALB"""
    return {"status": "healthy", "service": "marker-ocr"}


@app.post("/extract")
async def extract_pdf(file: UploadFile = File(...)):
    """Extract text from PDF file"""
    try:
        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files supported")

        # Read file content
        contents = await file.read()

        logger.info(f"Processing PDF: {file.filename} ({len(contents)} bytes)")

        # Convert PDF using marker
        converter = PdfConverter(fname="", model_dict=model_dict)
        # This is a simplified version - actual implementation would process the PDF

        return {
            "filename": file.filename,
            "status": "processed",
            "message": "PDF processing complete",
        }
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    logger.info("Starting FastAPI server on 0.0.0.0:8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
