# CollabStudy - Database Architecture & ERD

## Overview
This document outlines the database design for CollabStudy, focusing on the core entities required for academic collaboration with AI assistance.

---

## Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COLLABSTUDY DATABASE SCHEMA                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│       User           │
├──────────────────────┤
│ id: UUID (PK)        │
│ email: String ◆      │
│ username: String ◆   │
│ passwordHash: String │
│ fullName: String?    │
│ avatar: String?      │
│ status: Enum         │─┐
│ lastActive: DateTime │ │
│ createdAt: DateTime  │ │
│ updatedAt: DateTime  │ │
└──────────────────────┘ │
         │               │
         │               │
         ▼               │
┌──────────────────────┐ │
│  WorkspaceMember     │ │
├──────────────────────┤ │
│ id: UUID (PK)        │ │
│ userId: UUID (FK) ───┼─┘
│ workspaceId: UUID───┼─┐
│ role: Enum           │ │
│ joinedAt: DateTime   │ │
│ updatedAt: DateTime  │ │
└──────────────────────┘ │
                         │
         ┌───────────────┘
         │
         ▼
┌──────────────────────┐
│     Workspace        │
├──────────────────────┤
│ id: UUID (PK)        │
│ name: String         │
│ description: String? │
│ ownerId: UUID (FK)───┼──┐
│ visibility: Enum     │  │
│ settings: JSON       │  │
│ createdAt: DateTime  │  │
│ updatedAt: DateTime  │  │
└──────────────────────┘  │
         │                │
         │                │
         ▼                │
┌──────────────────────┐  │
│      Channel         │  │
├──────────────────────┤  │
│ id: UUID (PK)        │  │
│ workspaceId: UUID─┬──┘  │
│ name: String      │     │
│ description: Str? │     │
│ type: Enum        │     │
│ isPrivate: Bool   │     │
│ createdById: UUID─┼─────┘
│ createdAt: Date   │
│ updatedAt: Date   │
└───────────────────┘
         │
         │
         ▼
┌──────────────────────┐         ┌──────────────────────┐
│      Message         │         │   MessageReaction    │
├──────────────────────┤         ├──────────────────────┤
│ id: UUID (PK)        │         │ id: UUID (PK)        │
│ channelId: UUID (FK)─┤         │ messageId: UUID (FK)─┼──┐
│ userId: UUID (FK)────┼──┐      │ userId: UUID (FK)────┼──┼──┐
│ content: Text        │  │      │ emoji: String        │  │  │
│ type: Enum           │  │      │ createdAt: DateTime  │  │  │
│ parentId: UUID? ─────┼──┼─┐    └──────────────────────┘  │  │
│ isEdited: Boolean    │  │ │                              │  │
│ isPinned: Boolean    │  │ │    ┌──────────────────────┐  │  │
│ metadata: JSON       │  │ │    │   MessageAttachment  │  │  │
│ createdAt: DateTime  │  │ │    ├──────────────────────┤  │  │
│ updatedAt: DateTime  │  │ │    │ id: UUID (PK)        │  │  │
│ deletedAt: DateTime? │◀─┘ │    │ messageId: UUID (FK)─┼──┘  │
└──────────────────────┘    │    │ fileName: String     │     │
         │                  │    │ fileUrl: String      │     │
         │                  │    │ fileType: String     │     │
         ▼                  │    │ fileSize: Int        │     │
┌──────────────────────┐   │    │ uploadedAt: DateTime │     │
│   MessageMention     │   │    └──────────────────────┘     │
├──────────────────────┤   │                                 │
│ id: UUID (PK)        │   │                                 │
│ messageId: UUID (FK)─┼───┘                                 │
│ userId: UUID (FK)────┼─────────────────────────────────────┘
│ createdAt: DateTime  │
└──────────────────────┘


┌──────────────────────┐         ┌──────────────────────┐
│    AIContext         │         │   AIConversation     │
├──────────────────────┤         ├──────────────────────┤
│ id: UUID (PK)        │         │ id: UUID (PK)        │
│ channelId: UUID (FK)─┼──┐      │ contextId: UUID (FK)─┼──┐
│ workspaceId: UUID───┼──┼─┐    │ userId: UUID (FK)────┼──┼─┐
│ contextType: Enum    │  │ │    │ messages: JSON[]     │  │ │
│ contextData: JSON    │  │ │    │ model: String        │  │ │
│ embeddings: Vector?  │  │ │    │ temperature: Float   │  │ │
│ metadata: JSON       │  │ │    │ createdAt: DateTime  │  │ │
│ createdAt: DateTime  │  │ │    │ updatedAt: DateTime  │  │ │
│ updatedAt: DateTime  │  │ │    └──────────────────────┘  │ │
└──────────────────────┘  │ │                              │ │
         │                │ │    ┌──────────────────────┐  │ │
         ▼                │ │    │   AIGeneratedContent │  │ │
┌──────────────────────┐  │ │    ├──────────────────────┤  │ │
│  AIContextMessage    │  │ │    │ id: UUID (PK)        │  │ │
├──────────────────────┤  │ │    │ conversationId: UUID─┼──┘ │
│ id: UUID (PK)        │  │ │    │ messageId: UUID (FK)─┼────┼─┐
│ contextId: UUID (FK)─┼──┘ │    │ contentType: Enum    │    │ │
│ messageId: UUID (FK)─┼────┼─┐  │ content: Text        │    │ │
│ relevanceScore: Float│    │ │  │ confidence: Float    │    │ │
│ addedAt: DateTime    │    │ │  │ metadata: JSON       │    │ │
└──────────────────────┘    │ │  │ createdAt: DateTime  │    │ │
                            │ │  └──────────────────────┘    │ │
                            │ │                              │ │
                            │ └──────────────────────────────┘ │
                            └────────────────────────────────────┘

┌──────────────────────┐
│      Session         │
├──────────────────────┤
│ id: UUID (PK)        │
│ userId: UUID (FK)────┼──┐
│ token: String ◆      │  │
│ ipAddress: String    │  │
│ userAgent: String    │  │
│ expiresAt: DateTime  │  │
│ createdAt: DateTime  │  │
└──────────────────────┘  │
                          │
         ┌────────────────┘
         │
         ▼
┌──────────────────────┐
│   UserPreferences    │
├──────────────────────┤
│ id: UUID (PK)        │
│ userId: UUID (FK) ◆  │
│ theme: String        │
│ language: String     │
│ notifications: JSON  │
│ aiSettings: JSON     │
│ updatedAt: DateTime  │
└──────────────────────┘


LEGEND:
────────
PK  = Primary Key
FK  = Foreign Key
◆   = Unique Constraint
?   = Nullable Field
│   = One-to-Many Relationship
──  = Foreign Key Reference
```

---

## Core Entities Description

### 1. **User**
Central entity representing platform users.

**Fields:**
- `id`: UUID primary key
- `email`: Unique email address
- `username`: Unique username
- `passwordHash`: Bcrypt hashed password
- `fullName`: Optional display name
- `avatar`: Optional profile picture URL
- `status`: Enum (ONLINE, OFFLINE, AWAY, DO_NOT_DISTURB)
- `lastActive`: Last activity timestamp
- Timestamps: `createdAt`, `updatedAt`

**Relationships:**
- One-to-Many: WorkspaceMember, Message, Session
- One-to-One: UserPreferences

---

### 2. **Workspace**
Container for collaborative academic projects/groups.

**Fields:**
- `id`: UUID primary key
- `name`: Workspace name (e.g., "CS101 Study Group")
- `description`: Optional workspace description
- `ownerId`: Foreign key to User
- `visibility`: Enum (PUBLIC, PRIVATE, INVITE_ONLY)
- `settings`: JSON for workspace-specific configuration
- Timestamps: `createdAt`, `updatedAt`

**Relationships:**
- Many-to-One: User (owner)
- One-to-Many: Channel, WorkspaceMember, AIContext

---

### 3. **WorkspaceMember**
Junction table for User-Workspace many-to-many relationship.

**Fields:**
- `id`: UUID primary key
- `userId`: Foreign key to User
- `workspaceId`: Foreign key to Workspace
- `role`: Enum (OWNER, ADMIN, MEMBER, VIEWER)
- Timestamps: `joinedAt`, `updatedAt`

**Composite Unique Index:** (userId, workspaceId)

---

### 4. **Channel**
Communication channels within workspaces.

**Fields:**
- `id`: UUID primary key
- `workspaceId`: Foreign key to Workspace
- `name`: Channel name (e.g., "general", "homework-help")
- `description`: Optional channel description
- `type`: Enum (TEXT, VOICE, VIDEO, AI_ASSISTANT)
- `isPrivate`: Boolean flag
- `createdById`: Foreign key to User
- Timestamps: `createdAt`, `updatedAt`

**Relationships:**
- Many-to-One: Workspace
- One-to-Many: Message, AIContext

---

### 5. **Message**
Core messaging entity supporting threaded conversations.

**Fields:**
- `id`: UUID primary key
- `channelId`: Foreign key to Channel
- `userId`: Foreign key to User (author)
- `content`: Message text content
- `type`: Enum (TEXT, SYSTEM, AI_RESPONSE, CODE_SNIPPET)
- `parentId`: Self-referential FK for threading (nullable)
- `isEdited`: Boolean flag
- `isPinned`: Boolean flag
- `metadata`: JSON for rich content (code blocks, formatting, etc.)
- Timestamps: `createdAt`, `updatedAt`, `deletedAt` (soft delete)

**Relationships:**
- Many-to-One: Channel, User
- One-to-Many: MessageReaction, MessageAttachment, MessageMention
- Self-referential: Parent message for threads

---

### 6. **MessageReaction**
User reactions to messages (emoji responses).

**Fields:**
- `id`: UUID primary key
- `messageId`: Foreign key to Message
- `userId`: Foreign key to User
- `emoji`: String (emoji unicode or shortcode)
- Timestamp: `createdAt`

**Composite Unique Index:** (messageId, userId, emoji)

---

### 7. **MessageAttachment**
File attachments for messages.

**Fields:**
- `id`: UUID primary key
- `messageId`: Foreign key to Message
- `fileName`: Original file name
- `fileUrl`: Storage URL (S3, etc.)
- `fileType`: MIME type
- `fileSize`: Size in bytes
- Timestamp: `uploadedAt`

---

### 8. **MessageMention**
User mentions within messages (@username).

**Fields:**
- `id`: UUID primary key
- `messageId`: Foreign key to Message
- `userId`: Foreign key to User (mentioned user)
- Timestamp: `createdAt`

**Composite Unique Index:** (messageId, userId)

---

### 9. **AIContext**
Contextual information for AI assistant per channel/workspace.

**Fields:**
- `id`: UUID primary key
- `channelId`: Foreign key to Channel (nullable)
- `workspaceId`: Foreign key to Workspace
- `contextType`: Enum (COURSE_MATERIAL, STUDY_NOTES, CONVERSATION_HISTORY, REFERENCE_DOCS)
- `contextData`: JSON structured data
- `embeddings`: Vector field for semantic search (pgvector)
- `metadata`: JSON for additional context metadata
- Timestamps: `createdAt`, `updatedAt`

**Relationships:**
- Many-to-One: Channel, Workspace
- One-to-Many: AIContextMessage, AIConversation

---

### 10. **AIContextMessage**
Links messages to AI context for retrieval.

**Fields:**
- `id`: UUID primary key
- `contextId`: Foreign key to AIContext
- `messageId`: Foreign key to Message
- `relevanceScore`: Float (0.0-1.0) for ranking
- Timestamp: `addedAt`

---

### 11. **AIConversation**
Tracks AI conversation sessions for context continuity.

**Fields:**
- `id`: UUID primary key
- `contextId`: Foreign key to AIContext
- `userId`: Foreign key to User
- `messages`: JSON array of conversation history
- `model`: AI model used (e.g., "gpt-4-turbo")
- `temperature`: Float parameter for AI generation
- Timestamps: `createdAt`, `updatedAt`

---

### 12. **AIGeneratedContent**
Stores AI-generated content linked to conversations and messages.

**Fields:**
- `id`: UUID primary key
- `conversationId`: Foreign key to AIConversation
- `messageId`: Foreign key to Message (nullable)
- `contentType`: Enum (SUMMARY, EXPLANATION, CODE, QUIZ, FLASHCARDS)
- `content`: Text content generated by AI
- `confidence`: Float score from AI model
- `metadata`: JSON for generation parameters
- Timestamp: `createdAt`

---

### 13. **Session**
User authentication sessions.

**Fields:**
- `id`: UUID primary key
- `userId`: Foreign key to User
- `token`: Unique session token
- `ipAddress`: Client IP address
- `userAgent`: Client user agent string
- `expiresAt`: Session expiration timestamp
- Timestamp: `createdAt`

---

### 14. **UserPreferences**
User-specific settings and preferences.

**Fields:**
- `id`: UUID primary key
- `userId`: Foreign key to User (unique)
- `theme`: String (LIGHT, DARK, AUTO)
- `language`: String (en, es, fr, etc.)
- `notifications`: JSON for notification settings
- `aiSettings`: JSON for AI assistant preferences
- Timestamp: `updatedAt`

---

## Indexing Strategy

### Primary Indexes
- All `id` fields (automatic via PRIMARY KEY)

### Foreign Key Indexes
- `WorkspaceMember(userId, workspaceId)` - composite unique
- `Channel(workspaceId)`
- `Message(channelId, createdAt)` - for pagination
- `Message(userId)`
- `Message(parentId)` - for thread queries
- `MessageReaction(messageId)`
- `AIContext(channelId, workspaceId)`
- `Session(userId, expiresAt)`

### Performance Indexes
- `User(email)` - unique, for login queries
- `User(username)` - unique, for lookups
- `Message(deletedAt)` - for filtering soft-deleted
- `AIContext(embeddings)` - vector index for similarity search (IVFFlat or HNSW)

---

## Database Features

### PostgreSQL Extensions Required
```sql
-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vector similarity search for AI embeddings
CREATE EXTENSION IF NOT EXISTS "vector";

-- Full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### Data Integrity Rules
1. **Soft Deletes**: Messages use `deletedAt` for soft deletion
2. **Cascading**: Workspace deletion cascades to channels and members
3. **Constraints**: Unique constraints on email, username, session tokens
4. **Check Constraints**: Role enums, status enums, positive file sizes

---

## Scaling Considerations

### Read Replicas
- Message queries (high read volume)
- AI context retrieval

### Partitioning Strategy
- `Message` table: Partition by `createdAt` (monthly)
- `Session` table: Partition by `createdAt` (daily, auto-prune)

### Caching Strategy (Redis)
- User sessions (key: `session:{token}`)
- Workspace member lists (key: `workspace:{id}:members`)
- Active user presence (key: `user:{id}:status`)
- Recent messages per channel (key: `channel:{id}:messages`, sorted set)

---

## Migration Strategy

### Phase 1: Core Tables
1. User, UserPreferences, Session
2. Workspace, WorkspaceMember
3. Channel

### Phase 2: Messaging
4. Message, MessageReaction, MessageAttachment, MessageMention

### Phase 3: AI Features
5. AIContext, AIContextMessage
6. AIConversation, AIGeneratedContent

---

## Next Steps After Approval

1. Generate Prisma schema from this ERD
2. Create initial migration
3. Seed database with test data
4. Implement repository patterns in NestJS
5. Set up Redis caching layer
