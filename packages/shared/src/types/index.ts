// Shared TypeScript types for CollabStudy

export enum UserStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  AWAY = 'AWAY',
  DO_NOT_DISTURB = 'DO_NOT_DISTURB',
}

export enum WorkspaceMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum MessageType {
  TEXT = 'TEXT',
  SYSTEM = 'SYSTEM',
  AI_RESPONSE = 'AI_RESPONSE',
  CODE_SNIPPET = 'CODE_SNIPPET',
}

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  avatar?: string;
  status: UserStatus;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  type: MessageType;
  createdAt: Date;
  updatedAt: Date;
}
