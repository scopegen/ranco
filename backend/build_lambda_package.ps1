# Builds a Lambda deployment zip targeting Amazon Linux (x86_64, Python 3.13),
# not whatever wheels pip would grab by default on Windows. Run from backend/.
#
#   .\build_lambda_package.ps1
#
# Produces lambda_deploy.zip, ready to upload directly in the Lambda console
# (or via `aws lambda update-function-code --zip-file fileb://lambda_deploy.zip`).

$ErrorActionPreference = "Stop"
$buildDir = "lambda_build"
$zipPath = "lambda_deploy.zip"

if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
New-Item -ItemType Directory -Path $buildDir | Out-Null

Write-Host "Installing dependencies for manylinux2014_x86_64 / Python 3.13..."
pip install `
  --platform manylinux2014_x86_64 `
  --target $buildDir `
  --python-version 3.13 `
  --implementation cp `
  --only-binary=:all: `
  -r requirements-lambda.txt

Write-Host "Copying app code..."
Copy-Item -Recurse app "$buildDir\app"
Copy-Item lambda_handler.py $buildDir\

# Trim things that don't need to ship: boto3/botocore/s3transfer/jmespath
# are already built into every Lambda Python runtime (bundling our own copy
# is ~20MB of pure waste); __pycache__ is just bytecode cache Lambda
# regenerates on cold start anyway; sqlalchemy's bundled test suite is
# never imported at runtime. None of this touches actually-used code.
Write-Host "Trimming (runtime-provided packages, caches, unused test suite)..."
foreach ($pkg in @("boto3", "botocore", "s3transfer", "jmespath")) {
  Get-ChildItem $buildDir -Filter "$pkg*" -Directory | Remove-Item -Recurse -Force
}
Get-ChildItem $buildDir -Recurse -Directory -Filter "__pycache__" |
  Remove-Item -Recurse -Force
if (Test-Path "$buildDir\sqlalchemy\testing") {
  Remove-Item -Recurse -Force "$buildDir\sqlalchemy\testing"
}

Write-Host "Zipping..."
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPath

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Done: $zipPath ($sizeMB MB) - upload this in the Lambda console (or via the CLI)."
if ($sizeMB -gt 50) {
  Write-Host "WARNING: over Lambda's 50MB direct-upload limit - upload via S3 instead, or trim further." -ForegroundColor Yellow
}