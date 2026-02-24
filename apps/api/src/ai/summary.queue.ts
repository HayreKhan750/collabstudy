/**
 * BullMQ queue name and job type definitions for AI summary jobs.
 */

export const SUMMARY_QUEUE = 'summary';

/** Payload for a channel summary job */
export interface ChannelSummaryJobData {
  type: 'channel';
  channelId: string;
  userId: string;
}

/** Payload for a DM summary job */
export interface DmSummaryJobData {
  type: 'dm';
  conversationId: string;
  userId: string;
}

export type SummaryJobData = ChannelSummaryJobData | DmSummaryJobData;
