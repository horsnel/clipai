/**
 * platformTerminology.ts — Per-platform UI terminology for channel audits.
 *
 * Problem we're solving:
 *   The audit UI used to hardcode YouTube terminology everywhere — "channel",
 *   "subscribers", "videos" — even when auditing a TikTok profile, an X profile,
 *   or a Reddit subreddit. That looked unprofessional.
 *
 *   This module centralises the per-platform noun/adjective choices so every
 *   audit component (card, modal, full view, page) speaks the right dialect:
 *
 *     YouTube   → channel · subscribers · videos · views
 *     TikTok    → profile · followers  · posts  · views
 *     X         → profile · followers  · posts  · impressions
 *     Instagram → profile · followers  · posts  · views
 *     Reddit    → subreddit · members  · posts  · upvotes
 *
 * Usage:
 *   import { platformTerms } from '@/lib/platformTerminology';
 *   const t = platformTerms(audit.platform);
 *   <h1>{t.entity}</h1>           // "channel" | "profile" | "subreddit"
 *   <p>{t.followersLabel}</p>     // "Subscribers" | "Followers" | "Members"
 *   <p>{t.postsLabel}</p>         // "Videos" | "Posts"
 *
 * The `entity` field is the noun for what was audited (lowercase). The
 * `followersLabel`, `postsLabel`, `viewsLabel` are title-case UI labels.
 * The `followersShort` field is the compact tabular variant ("subs" | "foll" | "mem").
 */

import type { AuditPlatform } from '../types';

export interface PlatformTerms {
  /** Noun for the audited entity: "channel" | "profile" | "subreddit" */
  entity: string;
  /** Title-case noun: "Channel" | "Profile" | "Subreddit" */
  entityTitle: string,
  /** Plural noun: "channels" | "profiles" | "subreddits" */
  entityPlural: string,
  /** Label for the follower/subscriber stat: "Subscribers" | "Followers" | "Members" */
  followersLabel: string;
  /** Compact label for tight UI: "subs" | "foll" | "mem" */
  followersShort: string;
  /** Label for the post/video stat: "Videos" | "Posts" */
  postsLabel: string;
  /** Singular: "Video" | "Post" */
  postSingular: string,
  /** Label for views/impressions: "Views" | "Impressions" | "Upvotes" */
  viewsLabel: string;
  /** Lowercase noun for the avg-per-post metric: "views" | "impressions" | "upvotes" */
  viewsNoun: string;
  /** Label for total views/karma: "Total Views" | "Total Impressions" | "Total Karma" */
  totalViewsLabel: string;
  /** Label for the engagement stat: "Engagement" | "Comments/Post" */
  engagementLabel: string;
  /** Action verb for opening the entity: "Open channel" | "Open profile" | "Open subreddit" */
  openEntityLabel: string;
}

const TERMS: Record<AuditPlatform, PlatformTerms> = {
  youtube: {
    entity: 'channel',
    entityTitle: 'Channel',
    entityPlural: 'channels',
    followersLabel: 'Subscribers',
    followersShort: 'subs',
    postsLabel: 'Videos',
    postSingular: 'Video',
    viewsLabel: 'Views',
    viewsNoun: 'views',
    totalViewsLabel: 'Total Views',
    engagementLabel: 'Engagement',
    openEntityLabel: 'Open channel',
  },
  tiktok: {
    entity: 'profile',
    entityTitle: 'Profile',
    entityPlural: 'profiles',
    followersLabel: 'Followers',
    followersShort: 'foll',
    postsLabel: 'Posts',
    postSingular: 'Post',
    viewsLabel: 'Views',
    viewsNoun: 'views',
    totalViewsLabel: 'Total Views',
    engagementLabel: 'Engagement',
    openEntityLabel: 'Open profile',
  },
  twitter: {
    entity: 'profile',
    entityTitle: 'Profile',
    entityPlural: 'profiles',
    followersLabel: 'Followers',
    followersShort: 'foll',
    postsLabel: 'Posts',
    postSingular: 'Post',
    viewsLabel: 'Impressions',
    viewsNoun: 'impressions',
    totalViewsLabel: 'Total Impressions',
    engagementLabel: 'Engagement',
    openEntityLabel: 'Open profile',
  },
  instagram: {
    entity: 'profile',
    entityTitle: 'Profile',
    entityPlural: 'profiles',
    followersLabel: 'Followers',
    followersShort: 'foll',
    postsLabel: 'Posts',
    postSingular: 'Post',
    viewsLabel: 'Views',
    viewsNoun: 'views',
    totalViewsLabel: 'Total Views',
    engagementLabel: 'Engagement',
    openEntityLabel: 'Open profile',
  },
  reddit: {
    entity: 'subreddit',
    entityTitle: 'Subreddit',
    entityPlural: 'subreddits',
    followersLabel: 'Members',
    followersShort: 'mem',
    postsLabel: 'Posts',
    postSingular: 'Post',
    viewsLabel: 'Upvotes',
    viewsNoun: 'score',
    totalViewsLabel: 'Total Karma',
    engagementLabel: 'Comments/Post',
    openEntityLabel: 'Open subreddit',
  },
};

/** Returns the per-platform terminology for the given audit platform. */
export function platformTerms(platform: AuditPlatform): PlatformTerms {
  return TERMS[platform] || TERMS.youtube;
}
