.PHONY: install install-fe install-be dev run-frontend build bootstrap deploy clean update

# Install all dependencies
install: install-fe install-be

install-fe:
	cd frontend && npm install

install-be:
	cd backend && npm install
	cd backend/lambdas && npm install

# Run frontend development server
dev:
	cd frontend && npm run dev

# Alias for dev
run-frontend:
	cd frontend && npm run dev

# Build frontend for production
build:
	cd frontend && npm run build

# Build backend CDK
build-cdk:
	cd backend && npm run build

# Bootstrap CDK (required once per AWS account/region)
bootstrap:
	cd backend && npx cdk bootstrap

# Deploy backend only (API, Database, etc.)
deploy-backend:
	cd backend && npx cdk deploy BackendStack --require-approval never

# Get API URL from deployed backend
get-api-url:
	@aws cloudformation describe-stacks --stack-name BackendStack --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text

# Build frontend with API URL from deployed backend
build-frontend-with-api:
	$(eval API_URL := $(shell aws cloudformation describe-stacks --stack-name BackendStack --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text))
	cd frontend && VITE_API_URL=$(API_URL) npm run build

# Deploy frontend only
deploy-frontend:
	cd backend && npx cdk deploy FrontendStack --require-approval never

# Create placeholder frontend/dist so CDK synth works before frontend is built
ensure-frontend-dist:
	mkdir -p frontend/dist && touch frontend/dist/.gitkeep

# Deploy the entire application (backend first, then frontend with API URL)
deploy: ensure-frontend-dist build-cdk bootstrap deploy-backend build-frontend-with-api deploy-frontend

# Deploy with approval prompt
deploy-interactive: build build-cdk bootstrap
	cd backend && npx cdk deploy --all

# Synthesize CDK stack (useful for reviewing changes)
synth: build-cdk
	cd backend && npx cdk synth

# Diff CDK stack against deployed stack
diff: build-cdk
	cd backend && npx cdk diff

# Destroy the deployed stack
destroy:
	cd backend && npx cdk destroy --force

# Clean build artifacts
clean:
	rm -rf frontend/dist
	rm -rf backend/cdk.out
	find backend -type f \( -name "*.js" -o -name "*.d.ts" \) -not -path "*/node_modules/*" -delete

# Quick git update
update:
	git add . && git commit -m "update" && git push
