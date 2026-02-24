# CollabStudy

**AI-Powered Real-Time Academic Collaboration Platform**

---

## 🏗️ Architecture

CollabStudy is a polyglot microservice monorepo built with modern technologies:

### Frontend
- **Next.js 14** (App Router) - React framework with server-side rendering
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautifully designed components

### Backend
- **NestJS** - Progressive Node.js framework
- **Socket.io** - Real-time bidirectional communication
- **Prisma ORM** - Type-safe database access

### AI Service
- **FastAPI** (Python) - High-performance async API framework
- **LangChain** - AI orchestration framework
- **OpenAI** - GPT models for intelligent features

### Infrastructure
- **PostgreSQL** - Primary database with pgvector extension
- **Redis** - Caching and session management
- **Docker Compose** - Local development environment

---

## 📁 Project Structure

```
collabstudy/
├── apps/
│   ├── web/                 # Next.js frontend application
│   ├── api/                 # NestJS backend API
│   └── ai/                  # Python FastAPI AI service
├── packages/
│   ├── shared/              # Shared TypeScript types & utilities
│   ├── db/                  # Prisma schema & database client
│   └── ui/                  # Shared UI components (future)
├── docker-compose.yml       # Infrastructure services
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── turbo.json              # Turborepo configuration
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- Node.js 18+ and pnpm 8+
- Python 3.11+
- Docker and Docker Compose
- Git

### Quick Start

1. **Clone and Initialize**
   ```bash
   git clone <repository-url> collabstudy
   cd collabstudy
   ```

2. **Follow Setup Instructions**
   
   See [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md) for detailed step-by-step commands.

3. **Start Infrastructure**
   ```bash
   pnpm docker:up
   ```

4. **Install Dependencies**
   ```bash
   pnpm install
   ```

5. **Setup Database**
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

6. **Start Development Servers**
   ```bash
   pnpm dev
   ```

   Access the applications:
   - Frontend: http://localhost:3000
   - API: http://localhost:4000
   - AI Service: http://localhost:8000

---

## 📚 Documentation

- **[Setup Instructions](./SETUP_INSTRUCTIONS.md)** - Detailed initialization guide
- **[Database Design](./DATABASE_DESIGN.md)** - ERD and schema documentation
- **[Architecture Decisions](./ARCHITECTURE.md)** - Design patterns and choices _(coming soon)_
- **[API Documentation](./docs/API.md)** - REST & WebSocket endpoints _(coming soon)_

---

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm dev              # Start all services in development mode
pnpm dev:web          # Start frontend only
pnpm dev:api          # Start backend API only
pnpm dev:ai           # Start AI service only

# Building
pnpm build            # Build all applications
pnpm build:web        # Build frontend only
pnpm build:api        # Build backend only

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database
pnpm db:migrate       # Create migration
pnpm db:studio        # Open Prisma Studio

# Docker
pnpm docker:up        # Start infrastructure services
pnpm docker:down      # Stop infrastructure services
pnpm docker:logs      # View container logs

# Code Quality
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier
pnpm test             # Run tests

# Cleanup
pnpm clean            # Remove build artifacts
pnpm clean:full       # Deep clean including node_modules
```

---

## 🗄️ Database Schema

The platform uses PostgreSQL with the following core entities:

- **Users** - Authentication and user management
- **Workspaces** - Collaborative project containers
- **Channels** - Communication channels within workspaces
- **Messages** - Real-time messaging with threading
- **AI Context** - Contextual information for AI assistance

See [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) for the complete ERD and schema details.

---

## 🤖 AI Features (Planned)

- **Intelligent Summarization** - Auto-summarize long discussions
- **Study Assistant** - Answer questions based on course materials
- **Code Explanations** - Explain code snippets in natural language
- **Quiz Generation** - Generate practice questions from content
- **Flashcard Creation** - Create study flashcards automatically

---

## 🧪 Testing Strategy

- **Frontend**: Jest + React Testing Library
- **Backend**: Jest + Supertest
- **AI Service**: pytest
- **E2E**: Playwright _(coming soon)_

---

## 🚢 Deployment

Deployment guides coming soon for:
- Vercel (Frontend)
- Railway/Render (Backend)
- Cloud Run (AI Service)
- Neon/Supabase (PostgreSQL)
- Upstash (Redis)

---

## 📝 License

MIT

---

## 👥 Team

Principal Software Architect: [Your Name]

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines _(coming soon)_.

---

**Status**: 🏗️ Phase 1 - Foundation Setup (In Progress)
