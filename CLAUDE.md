# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Lambda function that fetches train transit information from Jorudan (Japanese transit service). Deployed using AWS SAM (Serverless Application Model).

## Architecture

- **Runtime**: Python 3.8
- **Entry point**: `src/lambda_function.py` → `lambda_handler(event, context)`
- **API Gateway trigger**: GET `/transit`
- **Region**: ap-northeast-1

## Build and Deploy

```bash
# Validate SAM template
sam validate

# Build the application
sam build

# Deploy (first time - guided)
sam deploy --guided

# Deploy (subsequent)
sam deploy

# Local testing
sam local invoke
sam local start-api
```

## Code Structure

The Lambda function scrapes Jorudan's transit website and parses HTML to extract:
- `getSummary()`: Departure/arrival times, duration, transfer count
- `getRoute()`: Detailed route information

Returns JSON with `transfers` array containing `[summary, route]` pairs.
