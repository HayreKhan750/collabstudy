# CollabStudy - Architecture Blueprint Summary

## 📋 Project Overview

**CollabStudy** is an AI-Powered Real-Time Academic Collaboration Platform built as a polyglot microservice monorepo using pnpm workspaces.

---

## 🏛️ Architectural Style

**Polyglot Microservice Monorepo**

### Core Principles
1. **Monorepo Structure** - All services in a single repository for easier development
2. **Language Diversity** - TypeScript for web/API, Python for AI workloads
3. **Service Independence** - Each service can be deployed independently
4. **Shared Packages** - Common types and database access shared across services

---

## 📦 Technology Stack

### Frontend Layer (`apps/web`)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: React Context + Server Components
- **Real-time**: Socket.io Client

### Backend Layer (`apps/api`)
- **Framework**: NestJS
- **Language**: TypeScript
- **Real-time**: Socket.io Server
- **ORM**: Prisma
- **Authentication**: JWT + Passport
- **Validation**: class-validator

### AI Service Layer (`apps/ai`)
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **AI Framework**: LangChain
- **AI Provider**: OpenAI GPT
- **Vector Search**: pgvector
- **Async Runtime**: uvicorn

### Infrastructure
- **Primary Database**: PostgreSQL 16 with extensions (uuid-ossp, vector, pg_trgm)
- **Cache/Session Store**: Redis 7
- **Container Orchestration**: Docker Compose (local)
- **Package Manager**: pnpm 8+
- **Build System**: Turborepo

---

## 🗂️ Repository Structure

```
collabstudy/
│
├── apps/                           # Application services
│   ├── web/                        # Next.js frontend (Port 3000)
│   │   ├── src/
│   │   │   ├── app/               # App router pages
│   │   │   ├── components/        # React components
│   │   │   └── lib/               # Utilities
│   │   ├── public/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                        # NestJS backend (Port 4000)
│   │   ├── src/
│   │   │   ├── auth/              # Authentication module
│   │   │   ├── workspaces/        # Workspace module
│   │   │   ├── channels/          # Channel module
│   │   │   ├── messages/          # Messaging module
│   │   │   ├── gateway/           # WebSocket gateway
│   │   │   └── main.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ai/                         # Python AI service (Port 8000)
│       ├── app/
│       │   ├── routers/           # API routes
│       │   ├── services/          # Business logic
│       │   └── models/            # Data models
│       ├── main.py
│       ├── requirements.txt
│       └── venv/                  # Virtual environment
│
├── packages/                       # Shared packages
│   ├── db/                         # Prisma database package
│   │   ├── prisma/
│   │   │   └── schema.prisma      # Database schema
│   │   ├── src/
│   │   │   └── index.ts           # Prisma client export
│   │   └── package.json
│   │
│   ├── shared/                     # Shared TypeScript utilities
│   │   ├── src/
│   │   │   ├── types/             # Common types
│   │   │   ├── schemas/           # Zod validation schemas
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ui/                         # Shared UI components (future)
│       └── package.json
│
├── docker/                         # Docker configurations
│   └── postgres/
│       └── init.sql               # PostgreSQL initialization
│
├── docs/                           # Documentation (future)
│   ├── API.md
│   └── DEPLOYMENT.md
│
├── .github/                        # GitHub configurations (future)
│   └── workflows/
│       └── ci.yml
│
├── docker-compose.yml              # Infrastructure services
├── pnpm-workspace.yaml             # Workspace configuration
├── turbo.json                      # Turborepo configuration
├── package.json                    # Root package.json
├── tsconfig.json                   # Root TypeScript config
├── .prettierrc                     # Code formatting
├── .eslintrc.json                  # Linting rules
├── .gitignore                      # Git ignore rules
├── README.md                       # Project overview
├── SETUP_INSTRUCTIONS.md           # Setup guide
├── DATABASE_DESIGN.md              # Database documentation
└── ARCHITECTURE_BLUEPRINT.md       # This file
```

---

## 🗄️ Data Architecture

### Database Schema Overview

**14 Core Tables** organized into 4 logical groups:

#### 1. User Management (3 tables)
- `users` - User accounts and profiles
- `user_preferences` - User settings and preferences
- `sessions` - Authentication sessions

#### 2. Workspace & Collaboration (3 tables)
- `workspaces` - Collaborative project containers
- `workspace_members` - User-workspace many-to-many relationship
- `channels` - Communication channels within workspaces

#### 3. Messaging (4 tables)
- `messages` - Core messaging with threading support
- `message_reactions` - Emoji reactions
- `message_attachments` - File attachments
- `message_mentions` - User mentions (@username)

#### 4. AI Context & Intelligence (4 tables)
- `ai_contexts` - Contextual information for AI
- `ai_context_messages` - Links messages to AI context
- `ai_conversations` - Tracks AI conversation sessions
- `ai_generated_content` - AI-generated content storage

### Key Database Features
- **UUID Primary Keys** - Globally unique identifiers
- **Soft Deletes** - Messages use `deletedAt` timestamp
- **Vector Embeddings** - pgvector for semantic search
- **JSON Fields** - Flexible metadata storage
- **Composite Indexes** - Optimized for common queries

---

## 🔄 Communication Patterns

### Client ↔ Frontend (apps/web)
- **Protocol**: HTTP/HTTPS + WebSocket
- **Pattern**: Server-side rendering + Client hydration
- **Real-time**: Socket.io for live updates

### Frontend ↔ Backend API (apps/api)
- **Protocol**: REST API + WebSocket
- **Authentication**: JWT Bearer tokens
- **Real-time Events**:
  - `message:new` - New message in channel
  - `user:status` - User status changes
  - `typing:start/stop` - Typing indicators
  - `reaction:add` - Message reactions

### Backend API ↔ Database
- **ORM**: Prisma Client
- **Connection Pool**: PostgreSQL connection pooling
- **Migrations**: Prisma Migrate

### Backend API ↔ AI Service
- **Protocol**: HTTP REST
- **Pattern**: Async task queue (future: Bull/Redis)
- **Endpoints**:
  - `POST /ai/summarize` - Summarize content
  - `POST /ai/answer` - Answer questions
  - `POST /ai/generate` - Generate content

### AI Service ↔ Database
- **Protocol**: Direct PostgreSQL connection (asyncpg)
- **Vector Search**: pgvector similarity queries
- **Embeddings**: OpenAI text-embedding-ada-002

### Services ↔ Redis
- **Use Cases**:
  - Session storage
  - Real-time user presence
  - Message caching
  - Rate limiting
  - Background job queues

---

## 🔐 Security Architecture

### Authentication Flow
1. User submits credentials to `/api/auth/login`
2. Backend validates against `users` table
3. JWT token generated with user ID + role
4. Token stored in `sessions` table
5. Client stores token in httpOnly cookie
6. Subsequent requests include token in Authorization header

### Authorization Levels
- **Workspace Level**: OWNER, ADMIN, MEMBER, VIEWER
- **Channel Level**: Public vs Private access
- **Message Level**: Author-only edit/delete

### Data Protection
- Password hashing: bcrypt (10 rounds)
- JWT secret: Environment variable
- CORS: Configured per environment
- Rate limiting: Redis-based

---

## 🚀 Deployment Architecture (Future)

### Production Stack Recommendation

```
┌─────────────────────────────────────────────────────────────┐
│                         PRODUCTION                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Frontend (Vercel)                                          │
│  ├── CDN Edge Caching                                       │
│  ├── Automatic SSL                                          │
│  └── Environment: https://collabstudy.app                   │
│                                                             │
│  Backend API (Railway/Render)                               │
│  ├── Auto-scaling containers                                │
│  ├── Health checks                                          │
│  └── Environment: https://api.collabstudy.app               │
│                                                             │
│  AI Service (Google Cloud Run)                              │
│  ├── Serverless containers                                  │
│  ├── Cold start optimization                                │
│  └── Environment: https://ai.collabstudy.app                │
│                                                             │
│  PostgreSQL (Neon/Supabase)                                 │
│  ├── Managed PostgreSQL with pgvector                       │
│  ├── Automatic backups                                      │
│  └── Connection pooling (PgBouncer)                         │
│                                                             │
│  Redis (Upstash)                                            │
│  ├── Serverless Redis                                       │
│  ├── Global edge caching                                    │
│  └── REST API fallback                                      │
│                                                             │
│  File Storage (AWS S3/Cloudflare R2)                        │
│  └── Message attachments, user avatars                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Performance Considerations

### Database Optimization
- **Indexing Strategy**: All foreign keys + common query patterns
- **Connection Pooling**: Prisma connection pool (10-20 connections)
- **Query Optimization**: N+1 prevention with Prisma includes
- **Partitioning**: Messages table partitioned by month (future)

### Caching Strategy
- **Redis Cache**:
  - User sessions (TTL: 7 days)
  - Workspace member lists (TTL: 1 hour)
  - Recent messages per channel (TTL: 5 minutes)
- **Next.js Cache**:
  - Static pages: ISR with 60s revalidation
  - API routes: Per-request caching

### Real-time Optimization
- **WebSocket Rooms**: Socket.io rooms per channel
- **Event Throttling**: Typing indicators debounced
- **Presence Updates**: Batched every 30s

---

## 🧪 Testing Strategy

### Unit Tests
- **Frontend**: Jest + React Testing Library
- **Backend**: Jest + NestJS testing utilities
- **AI Service**: pytest + pytest-asyncio

### Integration Tests
- **API Tests**: Supertest + test database
- **Database Tests**: Prisma test migrations
- **AI Tests**: Mocked OpenAI responses

### E2E Tests (Future)
- **Framework**: Playwright
- **Scenarios**:
  - User registration flow
  - Workspace creation
  - Real-time messaging
  - AI assistant interaction

---

## 📈 Scalability Roadmap

### Phase 1: MVP (Current)
- Single instance per service
- Local PostgreSQL + Redis
- Basic authentication
- Real-time messaging
- AI summarization

### Phase 2: Production Ready
- Managed database (Neon)
- Managed Redis (Upstash)
- Horizontal scaling (multiple API instances)
- Load balancer
- File upload to S3
- Monitoring (Sentry, DataDog)

### Phase 3: Scale
- Database read replicas
- Message queue (Bull + Redis)
- Microservice separation
- API gateway
- Rate limiting
- CDN for static assets

---

## 🔧 Development Workflow

### Local Development
```bash
1. Start infrastructure: pnpm docker:up
2. Install dependencies: pnpm install
3. Setup database: pnpm db:push
4. Start all services: pnpm dev
```

### Feature Development
```bash
1. Create feature branch: git checkout -b feature/name
2. Develop with hot reload
3. Write tests
4. Lint & format: pnpm lint && pnpm format
5. Commit and push
6. Create pull request
```

### Database Changes
```bash
1. Edit schema.prisma
2. Generate migration: pnpm db:migrate
3. Apply to dev: pnpm db:push
4. Regenerate client: pnpm db:generate
```

---

## ✅ Phase 1 Deliverables

### Completed ✅
- [x] Repository initialization structure
- [x] pnpm workspace configuration
- [x] Docker Compose for infrastructure
- [x] Complete database ERD design
- [x] Prisma schema implementation
- [x] Turborepo configuration
- [x] Root package.json with scripts
- [x] Development tooling (ESLint, Prettier)
- [x] Documentation (README, Setup Guide, Database Design)

### Next Steps (Pending Approval)
- [ ] Initialize Next.js application
- [ ] Initialize NestJS application
- [ ] Initialize Python FastAPI application
- [ ] Setup authentication system
- [ ] Implement workspace/channel structure
- [ ] Implement real-time messaging
- [ ] Implement AI integration

---

## 📞 Support & Resources

### Documentation
- [Setup Instructions](./SETUP_INSTRUCTIONS.md)
- [Database Design](./DATABASE_DESIGN.md)
- [README](./README.md)

### Key Technologies
- [Next.js Docs](https://nextjs.org/docs)
- [NestJS Docs](https://docs.nestjs.com)
- [FastAPI Docs](https://fastapi.tiangolo.com)
- [Prisma Docs](https://www.prisma.io/docs)
- [Socket.io Docs](https://socket.io/docs)

---

**Blueprint Version**: 1.0  
**Last Updated**: 2026-02-19  
**Status**: ✅ Ready for Approval
