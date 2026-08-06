"""
Lambda entrypoint. Wraps the existing FastAPI app (unchanged) so it can run
behind a Lambda Function URL instead of uvicorn.

Deployed as the handler for the Amplify-managed backend function — see
../docs/deployment.md for the full setup (Aurora cluster, IAM, env vars).

Local dev is unaffected: `uvicorn app.main:app` still runs the same `app`
directly, this file is only imported inside Lambda.
"""

from mangum import Mangum

from app.main import app

handler = Mangum(app)