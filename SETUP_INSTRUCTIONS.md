# CollabStudy - Project Initialization Guide

## Prerequisites
- Node.js 18+ and pnpm 8+
- Python 3.11+
- Docker and Docker Compose
- Git

---

## Step-by-Step Initialization Commands

### 1. Initialize Repository Root

```bash
# Create project directory
mkdir collabstudy
cd collabstudy

# Initialize git
git init

# Initialize pnpm workspace
pnpm init

# Create directory structure
mkdir -p apps/web apps/api apps/ai packages/shared packages/ui packages/db
```

---

### 2. Initialize Frontend (Next.js App)

```bash
# Navigate to apps directory
cd apps

# Create Next.js application with TypeScript and Tailwind
pnpm create next-app@latest web \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint

# Install shadcn/ui dependencies
cd web
pnpm add class-variance-authority clsx tailwind-merge
pnpm add lucide-react
pnpm add -D @types/node @types/react @types/react-dom

# Initialize shadcn/ui
pnpm dlx shadcn-ui@latest init

# Return to root
cd ../..
```

---

### 3. Initialize Backend (NestJS API)

```bash
# Install NestJS CLI globally (optional)
pnpm add -g @nestjs/cli

# Create NestJS application
cd apps
npx @nestjs/cli new api --package-manager pnpm --skip-git

# Install required dependencies
cd api
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt
pnpm add @prisma/client bcrypt class-validator class-transformer
pnpm add -D @types/bcrypt @types/passport-jwt prisma

# Return to root
cd ../..
```

---

### 4. Initialize AI Service (Python FastAPI)

```bash
# Create AI service directory structure
cd apps/ai

# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment (Linux/Mac)
source venv/bin/activate

# For Windows, use:
# venv\Scripts\activate

# Create requirements.txt
cat > requirements.txt << EOF
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
pydantic-settings==2.1.0
redis==5.0.1
openai==1.10.0
langchain==0.1.5
langchain-openai==0.0.5
python-multipart==0.0.6
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
asyncpg==0.29.0
sqlalchemy==2.0.25
httpx==0.26.0
EOF

# Install dependencies
pip install -r requirements.txt

# Create basic FastAPI app structure
mkdir -p app/routers app/services app/models

# Create main.py
cat > main.py << 'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CollabStudy AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "CollabStudy AI Service"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
EOF

# Create .env.example
cat > .env.example << EOF
DATABASE_URL=postgresql://collabstudy:collabstudy123@localhost:5432/collabstudy
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_openai_api_key_here
EOF

# Deactivate virtual environment
deactivate

# Return to root
cd ../..
```

---

### 5. Create Shared Packages

```bash
# Create shared TypeScript package
cd packages/shared
pnpm init
cat > package.json << EOF
{
  "name": "@collabstudy/shared",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
EOF

mkdir -p src
cat > src/index.ts << EOF
export * from './types';
export * from './schemas';
EOF

cat > tsconfig.json << EOF
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Return to root
cd ../..

# Create database package (Prisma)
cd packages/db
pnpm init
cat > package.json << EOF
{
  "name": "@collabstudy/db",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.8.1"
  },
  "devDependencies": {
    "prisma": "^5.8.1"
  }
}
EOF

mkdir -p prisma
# Prisma schema will be created separately

cd ../..
```

---

### 6. Install Root Dependencies

```bash
# Install pnpm workspace dependencies
pnpm install

# Install shared development dependencies at root
pnpm add -D -w typescript @types/node prettier eslint turbo
```

---

### 7. Setup Infrastructure

```bash
# Start Docker services
docker-compose up -d

# Verify services are running
docker-compose ps

# Check PostgreSQL connection
docker-compose exec postgres psql -U collabstudy -d collabstudy -c "SELECT version();"
```

---

### 8. Initialize Database Schema

```bash
# Navigate to database package
cd packages/db

# Initialize Prisma (this will be done after schema is created)
pnpm db:generate
pnpm db:push

cd ../..
```

---

### 9. Create Environment Files

```bash
# Root .env
cat > .env << EOF
DATABASE_URL=postgresql://collabstudy:collabstudy123@localhost:5432/collabstudy
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_change_in_production
NODE_ENV=development
EOF

# Frontend .env.local
cat > apps/web/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
EOF

# Backend .env
cat > apps/api/.env << EOF
DATABASE_URL=postgresql://collabstudy:collabstudy123@localhost:5432/collabstudy
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_change_in_production
JWT_EXPIRES_IN=7d
PORT=4000
CORS_ORIGIN=http://localhost:3000
EOF

# AI Service .env (already created in step 4)
cat > apps/ai/.env << EOF
DATABASE_URL=postgresql://collabstudy:collabstudy123@localhost:5432/collabstudy
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_openai_api_key_here
PORT=8000
EOF
```

---

### 10. Create .gitignore

```bash
cat > .gitignore << EOF
# Dependencies
node_modules/
.pnp
.pnp.js

# Python
venv/
__pycache__/
*.py[cod]
*$py.class
.Python
*.so
.pytest_cache/

# Testing
coverage/
*.lcov
.nyc_output

# Production
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Prisma
packages/db/prisma/migrations/

# Turbo
.turbo/
EOF
```

---

## Verification Commands

After setup, verify everything is working:

```bash
# Check pnpm workspace
pnpm -r list

# Run all services in development
pnpm dev

# Check Docker services
docker-compose ps

# Test frontend (should open on http://localhost:3000)
# Test API (should respond on http://localhost:4000)
# Test AI service (should respond on http://localhost:8000)
```

---

## Next Steps

1. ✅ Review pnpm-workspace.yaml
2. ✅ Review docker-compose.yml
3. ✅ Review Database ERD and Prisma schema
4. 🔄 Approve architecture before implementing features
5. ⏳ Implement authentication
6. ⏳ Implement workspace/channel structure
7. ⏳ Implement real-time messaging
8. ⏳ Implement AI features
