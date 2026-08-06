# Deployment — Amplify (frontend) + Lambda (backend) + Aurora Serverless v2

Architecture: the React frontend deploys to Amplify from this repo as
before. The FastAPI backend (wrapped with Mangum) deploys separately,
straight to a Lambda function — not through Amplify's function tooling,
which is Node-first and would need Docker/CDK for a Python runtime with no
real benefit here. The database is Aurora Serverless v2 (PostgreSQL),
reached via the RDS Data API — no VPC, no NAT Gateway, no database driver to
package.

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

## 4. Deploy the backend as a Lambda function (direct, not through Amplify)

Deployed straight to Lambda via the console/CLI, not through Amplify's
function tooling — same code either way, this path just skips the
Docker/CDK requirement Amplify's Node-first function support would add for
a Python runtime.

**Build the deployment package** (from `backend/`, on the dev machine):

```
.\build_lambda_package.ps1
```

This installs `requirements-lambda.txt` targeting Amazon Linux
(manylinux2014_x86_64, Python 3.13) instead of whatever wheels pip would
grab locally on Windows, then zips `app/` + `lambda_handler.py` into
`lambda_deploy.zip`.

**Create the function** in the Lambda console:

- Runtime: **Python 3.13**
- Upload `lambda_deploy.zip` directly (under 50MB zipped — comfortably
  within that for this app)
- Handler: `lambda_handler.handler`
- Attach the IAM policy from step 2 to its execution role
- Set the environment variables from step 3
- Under **Configuration → Function URL**, create one with CORS enabled:
  allowed origin = the Amplify frontend URL, allowed headers include
  `authorization` and `content-type`

Point the frontend at it: set `VITE_API_BASE_URL` in Amplify's build
environment variables to the Function URL.

Re-deploying after a backend code change: re-run
`.\build_lambda_package.ps1`, then re-upload the new zip (console, or
`aws lambda update-function-code --function-name <name> --zip-file
fileb://lambda_deploy.zip`).

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