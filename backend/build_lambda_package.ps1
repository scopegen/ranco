# Builds a Lambda deployment zip targeting Amazon Linux (x86_64, Python 3.13) —
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

Write-Host "Zipping..."
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPath

Write-Host "Done: $zipPath — upload this in the Lambda console (or via the CLI)."