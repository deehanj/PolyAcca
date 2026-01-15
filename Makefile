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

# Deploy the entire application (builds frontend first, then deploys via CDK)
deploy: build build-cdk bootstrap
	cd backend && npx cdk deploy --all --require-approval never

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
