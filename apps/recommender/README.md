# Recommender Service

This is a Python-based service that provides smart recommendations for the Socsboard application.

For definitions of technical terms, please see the main project [**Glossary**](../../GLOSSARY.md).

## Purpose

The main goal of this service is to handle complex calculations and machine learning tasks separately from the main web
application. This keeps the main application running fast and smoothly.

## How It Works

The main web application communicates with this service using a [**REST API**](../../GLOSSARY.md#rest-api). This service
does not connect to the main database directly. Instead, it receives the data it needs from the web app to generate a
recommendation.

## Project Files

- `main.py`: The entry point that starts the service.
- `requirements.txt`: A list of the Python libraries this service needs to run.
- `model/`: A folder for storing machine learning models.
