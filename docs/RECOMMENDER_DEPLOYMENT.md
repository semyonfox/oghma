# Python Recommender Deployment Guide

Deploy the `apps/recommender` backend (Python FastAPI/Flask) independently from the frontend.

---

## Overview

The **Python recommender is deployed separately** from the Next.js frontend because:

1. **Different runtime:** Python ≠ Node.js (AWS Amplify is JS/TS optimized)
2. **Different dependencies:** ML libraries (pandas, sklearn, TensorFlow) vs JavaScript packages
3. **Independent scaling:** Recommendation algorithms updated without affecting frontend
4. **Cost optimization:** Lambda (pay-per-request) or ECS (containerized) vs always-on Amplify
5. **Different performance profiles:** Python scientific computing vs JavaScript web framework

---

## Architecture

### Current Status

`apps/recommender/` is a placeholder with minimal setup. You need to build:

```
apps/recommender/
├── main.py               # FastAPI/Flask application
├── requirements.txt      # Python dependencies
├── Dockerfile           # Container definition
├── src/
│   ├── models/          # ML model files (.pkl, .h5)
│   ├── services/        # Business logic (recommendation algorithms)
│   └── api/             # API endpoints
├── tests/               # Unit tests
└── README.md            # Local setup instructions
```

### Deployment Options Comparison

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **AWS Lambda** | Serverless, auto-scale to zero, simple | Cold starts (3-5s), 15 min timeout, 512 MB storage | $0.20/M invocations |
| **AWS ECS** | Full Python control, longer timeouts, GPU-ready | Always-on costs, more setup | $50-100/month |
| **AWS App Runner** | Container-native, auto-scales, simple | Always-on minimum, less control | $25-50/month |
| **Railway/Heroku** | Simplest deployment, great for MVP | Vendor lock-in, fixed costs | $7-25/month |

**Recommendation for your use case:**
- **MVP/Testing:** Use **Railway or Heroku** (simplest)
- **Production with ML:** Use **ECS with GPU** (if training needed)
- **Production without GPU:** Use **Lambda** (cheapest for periodic calls) or **App Runner** (simple, predictable)

---

## Part 1: Set Up Local Python Environment

### Prerequisites

```bash
# Check Python version (need 3.13+)
python3 --version

# Create virtual environment
cd apps/recommender
python3 -m venv venv

# Activate
source venv/bin/activate  # Linux/macOS
# or
venv\Scripts\activate     # Windows
```

### Create requirements.txt

```bash
cat > apps/recommender/requirements.txt << 'EOF'
fastapi==0.109.0
uvicorn==0.27.0
pydantic==2.5.0
python-multipart==0.0.6
psycopg2-binary==2.9.9
sqlalchemy==2.0.23
pandas==2.1.4
numpy==1.26.3
scikit-learn==1.3.2
python-dotenv==1.0.0
EOF
```

### Create Minimal FastAPI App

`apps/recommender/main.py`:

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from datetime import datetime

app = FastAPI(title="SocsBoard Recommender", version="0.1.0")

# CORS for frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RecommendationRequest(BaseModel):
    user_id: int
    limit: int = 5

class RecommendationResponse(BaseModel):
    user_id: int
    recommendations: list
    generated_at: str

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "socsboard-recommender",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/recommend")
def get_recommendations(req: RecommendationRequest):
    """Get personalized event recommendations for a user"""
    
    # TODO: Implement recommendation algorithm
    # For now, return dummy data
    
    return RecommendationResponse(
        user_id=req.user_id,
        recommendations=[
            {"event_id": 1, "title": "AI Workshop", "score": 0.95},
            {"event_id": 2, "title": "Web Dev Meetup", "score": 0.87},
        ],
        generated_at=datetime.utcnow().isoformat()
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Test Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python main.py

# Test endpoint (in another terminal)
curl -X POST http://localhost:8000/recommend \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "limit": 5}'

# Health check
curl http://localhost:8000/health
```

---

## Part 2: Deploy to AWS

### Option A: AWS Lambda (Recommended for low-traffic APIs)

#### Step 1: Create Lambda Handler

Modify `main.py` to work with Lambda:

```bash
pip install mangum  # ASGI-to-Lambda adapter
```

Create `apps/recommender/handler.py`:

```python
from mangum import Mangum
from main import app

lambda_handler = Mangum(app)
```

#### Step 2: Package Function

```bash
cd apps/recommender

# Create deployment package
pip install -r requirements.txt -t package/
cp main.py package/
cp handler.py package/

# Zip it
cd package
zip -r ../function.zip .
cd ..
```

#### Step 3: Create Lambda Function

Via AWS Console:
1. **Lambda** → **Create function**
2. **Runtime:** Python 3.13
3. **Handler:** `handler.lambda_handler`
4. **Upload zip:** `function.zip`
5. **Set environment variables:**
   - `DATABASE_URL` = RDS connection string
   - `FRONTEND_URL` = Amplify app URL

Via AWS CLI:

```bash
aws lambda create-function \
  --function-name socsboard-recommender \
  --runtime python3.13 \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler handler.lambda_handler \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{DATABASE_URL=postgresql://...,FRONTEND_URL=https://...}"
```

#### Step 4: Expose via API Gateway

1. **API Gateway** → **Create REST API**
2. **Create resource** → `/recommend` (POST)
3. **Integrate with Lambda** → Select `socsboard-recommender`
4. **Deploy to stage** → `prod`

Or use AWS CLI:

```bash
# Create API
RESTAPI_ID=$(aws apigateway create-rest-api \
  --name socsboard-recommender-api \
  --description "Recommendation engine API" \
  --query 'id' --output text)

# Get root resource
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $RESTAPI_ID \
  --query 'items[0].id' --output text)

# Create /recommend resource
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $RESTAPI_ID \
  --parent-id $ROOT_ID \
  --path-part recommend \
  --query 'id' --output text)

# Create POST method (complex—use console instead)
```

**Simpler:** Use **Amplify CLI** for API integration:

```bash
amplify add api
# Choose REST
# Name: socsboard-recommender
# Choose Lambda function: socsboard-recommender
amplify push
```

---

### Option B: AWS App Runner (Recommended for simplicity)

Easiest way to deploy a containerized Python app.

#### Step 1: Create Dockerfile

`apps/recommender/Dockerfile`:

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8080

# Run app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

#### Step 2: Push to ECR (or use GitHub directly)

**Option 2a: Via ECR**

```bash
# Create ECR repository
aws ecr create-repository --repository-name socsboard-recommender

# Build and tag
docker build -t socsboard-recommender:latest apps/recommender/
docker tag socsboard-recommender:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest

# Login and push
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com

docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest
```

**Option 2b: Via GitHub (Simpler)**

App Runner can pull directly from GitHub:

1. Push `Dockerfile` and `apprunner.yaml` to repo
2. App Runner auto-detects and builds

#### Step 3: Create App Runner Service

Via AWS Console:
1. **App Runner** → **Create service**
2. **Source:** ECR (or GitHub)
3. **Image:** Select image
4. **Port:** 8080
5. **Environment variables:** 
   - `DATABASE_URL`
   - `FRONTEND_URL`
6. **Auto-scaling:** Min 1, Max 4 instances
7. **Create & deploy**

Via AWS CLI:

```bash
aws apprunner create-service \
  --service-name socsboard-recommender \
  --source-configuration \
    ImageRepository={ImageIdentifier=123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest,ImageRepositoryType=ECR} \
  --instance-configuration \
    Cpu=1024,Memory=2048,InstanceRoleArn=arn:aws:iam::ACCOUNT:role/app-runner-role \
  --auto-scaling-configuration \
    MinSize=1,MaxSize=4 \
  --tags Key=project,Value=socsboard
```

Output will include service URL: `https://xxxxx.us-east-1.apprunner.amazonaws.com`

---

### Option C: AWS ECS (For ML models or GPU)

More control, supports GPU for training.

#### Step 1: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name socsboard-prod
```

#### Step 2: Create Task Definition

`apps/recommender/task-definition.json`:

```json
{
  "family": "socsboard-recommender",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "recommender",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "DATABASE_URL",
          "value": "postgresql://..."
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/socsboard-recommender",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Step 3: Register Task Definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json
```

#### Step 4: Create Service

```bash
aws ecs create-service \
  --cluster socsboard-prod \
  --service-name socsboard-recommender \
  --task-definition socsboard-recommender:1 \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

---

## Part 3: Connect Frontend to Recommender

### Update Next.js API Route

`apps/web/src/app/api/recommend/route.js`:

```javascript
export async function POST(req) {
  const { user_id, limit = 5 } = await req.json();

  const recommenderUrl = process.env.NEXT_PUBLIC_RECOMMENDER_API_URL;
  if (!recommenderUrl) {
    return Response.json(
      { error: "Recommender API URL not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${recommenderUrl}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, limit })
    });

    if (!response.ok) {
      throw new Error(`Recommender returned ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Recommendation error:', error);
    return Response.json(
      { error: "Failed to get recommendations" },
      { status: 500 }
    );
  }
}
```

### Set Environment Variable in Amplify

In **Amplify Console** → **App settings** → **Environment variables:**

```
NEXT_PUBLIC_RECOMMENDER_API_URL=https://socsboard-recommender-xxxxx.us-east-1.apprunner.amazonaws.com
```

Or for Lambda/API Gateway:

```
NEXT_PUBLIC_RECOMMENDER_API_URL=https://api-id.execute-api.us-east-1.amazonaws.com/prod
```

---

## Part 4: Implement Recommendation Algorithm

Replace the dummy algorithm in `main.py`:

### Example: Content-Based Filtering

```python
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime

class RecommendationEngine:
    def __init__(self, db_connection):
        self.db = db_connection
        self.load_data()
    
    def load_data(self):
        # Load events and user preferences from database
        self.events = pd.read_sql("SELECT * FROM events", self.db)
        self.user_interests = pd.read_sql(
            "SELECT * FROM user_interests", self.db
        )
    
    def get_recommendations(self, user_id: int, limit: int = 5):
        # Get user's past interests
        user_prefs = self.user_interests[
            self.user_interests['user_id'] == user_id
        ]
        
        if len(user_prefs) == 0:
            # Return popular events if no history
            return self.events.nlargest(limit, 'interest_score').to_dict()
        
        # Calculate similarity with events
        similarities = cosine_similarity(
            user_prefs[['interest_vector']].values,
            self.events[['event_vector']].values
        )
        
        # Get top recommendations
        top_indices = similarities[0].argsort()[-limit:][::-1]
        return self.events.iloc[top_indices].to_dict(orient='records')

# In FastAPI endpoint
engine = RecommendationEngine(db)

@app.post("/recommend")
def get_recommendations(req: RecommendationRequest):
    recommendations = engine.get_recommendations(
        req.user_id,
        req.limit
    )
    
    return RecommendationResponse(
        user_id=req.user_id,
        recommendations=recommendations,
        generated_at=datetime.utcnow().isoformat()
    )
```

---

## Troubleshooting

### Lambda Cold Starts Too Slow (>5s)

**Solutions:**
1. Use **Lambda SnapStart** (instant execution for Java, not Python yet)
2. Use **ECS/App Runner** instead (no cold starts)
3. Implement caching in `apps/web` (reduce calls)
4. Use DynamoDB for lookups (faster than RDS)

### API Gateway Returns 502 Bad Gateway

**Check:**
1. Lambda execution role has permissions
2. Lambda timeout is sufficient (set to 30s min)
3. Function is actually deployed: `aws lambda list-functions`
4. Test Lambda directly: `aws lambda invoke --function-name socsboard-recommender response.json`

### App Runner Service Won't Start

**Check logs:**
```bash
aws apprunner describe-service --service-arn arn:aws:apprunner:...
```

**Common issues:**
- Port mismatch (Dockerfile uses 8000, config expects 8080)
- Environment variables missing
- Image not found in ECR

### Connection to RDS Times Out

**Check:**
1. RDS security group allows inbound on port 5432
2. RDS is in same VPC (or has public access enabled)
3. `DATABASE_URL` format correct: `postgresql://user:pass@host:port/db`

---

## Monitoring

### CloudWatch Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/socsboard-recommender --follow

# View App Runner logs
aws logs tail /aws/apprunner/socsboard-recommender/service --follow
```

### Set Up Alarms

```bash
# Alert if Lambda errors exceed 5% of invocations
aws cloudwatch put-metric-alarm \
  --alarm-name socsboard-recommender-errors \
  --alarm-description "High error rate" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 60 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

---

## Production Checklist

- [ ] Python app tested locally with `python main.py`
- [ ] `requirements.txt` has all dependencies pinned
- [ ] Dockerfile builds: `docker build -t test .`
- [ ] API returns correct responses from all endpoints
- [ ] CORS configured for Amplify frontend URL
- [ ] Environment variables set in Lambda/App Runner
- [ ] Database connection string works
- [ ] Health check endpoint `/health` responds
- [ ] Logging configured (CloudWatch)
- [ ] Error handling for missing user_id, database errors
- [ ] Rate limiting implemented (optional)
- [ ] API documentation at `/docs` (FastAPI auto-generates)

---

## Cost Estimation

| Service | Usage | Cost/Month |
|---------|-------|------------|
| **Lambda** | 100K calls × 1s | $0.20 |
| **App Runner** | 24/7 operation, 1 instance | $30 |
| **ECR** | Storage <1GB | $0.10 |
| **CloudWatch Logs** | 1GB/month | $0.50 |
| **Total** | | $0.80 - $30.80 |

---

## Next Steps

1. Implement actual recommendation algorithm (ML model)
2. Add database schema (events, user_interests, recommendations)
3. Integrate with events system from frontend
4. Set up training pipeline for ML models
5. Add monitoring/alerting
6. Scale recommender as needed

---

**Last Updated:** February 11, 2026
**Status:** Separate deployment from frontend
