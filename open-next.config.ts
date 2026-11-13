import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache binding: every page here is per-member and dynamic, so there is nothing worth caching in R2.
export default defineCloudflareConfig();
