# Deployment — Amplify (frontend + backend) + Aurora Serverless v2

Architecture: the React frontend and the FastAPI backend (as a Python Lambda
function, wrapped with Mangum) both deploy from this one repo through
Amplify. The database is Aurora Serverless v2 (PostgreSQL), reached via the
RDS Data API — no VPC, no NAT Gateway, no database driver to package.

Expected cost: ~$15-20/month, almost entirely Aurora (see the cost
discussion this plan came out of — Lambda, API/Function URL, and Amplify
hosting are all near-$0 at a single clinic's traffic).

## 1. Create the Aurora Serverless v2 cluster

In the RDS console:

1. **Create database** → Engine: **Aurora (PostgreSQL Compatible)**
2. Capacity type: **Serverless v2**
3. Set min/max ACUs — min **0** (enables scale-to-zero; requires PostgreSQL
   13.15+/14.12+/15.7+/16.3+, which current Aurora versions satisfy), max
   around **1-2** (plenty for this app's traffic)
4. Under **Connectivity**, turn on **Data API**
5. Credentials: let RDS auto-generate and store them in **Secrets Manager**
   (don't hand-manage a password — the Data API needs the secret ARN anyway)
6. Create the database once the cluster is up (`ranco_dental`)
7. Note down two ARNs from the cluster's details page:
   - the **cluster ARN** (`db_cluster_arn` below)
   - the **secret ARN** Secrets Manager created (`db_secret_arn` below)

## 2. IAM — let Lambda call the Data API

The Lambda function's execution role needs a policy allowing it to call the
Data API and read the DB secret. Attach a policy like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["rds-data:ExecuteStatement", "rds-data:BatchExecuteStatement",
                 "rds-data:BeginTransaction", "rds-data:CommitTransaction",
                 "rds-data:RollbackTransaction"],
      "Resource": "<cluster ARN>"
    },
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "<secret ARN>"
    }
  ]
}
```

Scope both `Resource` fields to the actual ARNs from step 1 — not `*`.

## 3. Environment variables on the Lambda function

```
DATABASE_URL=postgresql+auroradataapi://:@/ranco_dental
DB_CLUSTER_ARN=<cluster ARN from step 1>
DB_SECRET_ARN=<secret ARN from step 1>
JWT_SECRET=<a real secret, not the local dev one>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
CORS_ORIGINS=<the Amplify frontend URL, e.g. https://main.xxxxx.amplifyapp.com>
```

## 4. Deploy the backend as an Amplify function

Handler: `backend/lambda_handler.py`'s `handler`. Runtime: Python (match the
version in `backend/venv` locally). Give it a **Function URL** (not API
Gateway) with CORS configured to allow the Amplify frontend origin and the
`Authorization` header.

Point the frontend at it: set `VITE_API_BASE_URL` in Amplify's build
environment variables to the Function URL.

## 5. Run migrations against Aurora

Alembic uses the same SQLAlchemy engine as the app, so it goes through the
Data API dialect too — this can be run from any machine with AWS credentials
that have the IAM permissions from step 2 (doesn't need to be inside AWS):

```
DATABASE_URL=postgresql+auroradataapi://:@/ranco_dental \
DB_CLUSTER_ARN=<cluster ARN> \
DB_SECRET_ARN=<secret ARN> \
venv\Scripts\alembic upgrade head
```

Then seed data if this is a fresh database:

```
... venv\Scripts\python -m app.seed
```

## 6. Smoke test

Hit the Function URL's `/health` endpoint directly first, then run through
the login → patient → treatment → invoice → prescription flow from the live
Amplify frontend URL before calling it done.